import type Anthropic from "@anthropic-ai/sdk";
import { err, ok } from "@pna/core";
import type { z } from "zod";
import type { ProgressListener, ProviderResult } from "../ports/content-provider.js";
import { fixing, startWatch, watchEvent, type ItemReader, type ProgressWatch } from "../progress/watch.js";
import { toolInputSchema } from "../schemas/json-schema.js";
import { collectMessage } from "./accumulate.js";
import { invalidOutput, refused, structuralErrorMapper, type ErrorMapper } from "./errors.js";
import { webSearchTool } from "./models.js";

/**
 * The slice of the SDK this module uses — narrow enough to fake in tests.
 *
 * Generation is streamed, never a buffered response. A lecture or a program
 * plan runs for minutes and asks for tens of thousands of output tokens; a
 * single non-streaming request of that size sits on one open connection until
 * an HTTP timeout kills it, which on a phone looks like the app hanging and
 * then failing with an API error.
 *
 * The stream is consumed raw (`create` with `stream: true`) rather than through
 * the SDK's `MessageStream`, whose per-delta bookkeeping exists for rendering a
 * response live and costs CPU the Worker's cron budget cannot spare. The
 * message is assembled by `collectMessage`.
 */
export interface MessagesClient {
  readonly messages: {
    create(
      params: Anthropic.MessageCreateParamsStreaming,
    ): PromiseLike<AsyncIterable<Anthropic.RawMessageStreamEvent>>;
  };
}

export interface StructuredCall<T> {
  readonly system: string;
  readonly prompt: string;
  readonly toolName: string;
  readonly toolDescription: string;
  readonly schema: z.ZodType<T>;
  readonly maxTokens: number;
  /** Zero means "answer from the prompt alone" — no search tool is offered. */
  readonly maxSearches: number;
  readonly blockedDomains: readonly string[];
  readonly effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Finds the piece of the answer being written, for progress; none means no item is named. */
  readonly readItem?: ItemReader;
}

export interface StructuredRunnerConfig {
  readonly model: string;
  /** Safety net against a model that never calls the tool. */
  readonly maxIterations?: number;
  /** Supplied by the provider once the SDK is loaded, so typed errors are used. */
  readonly mapError?: ErrorMapper;
}

const DEFAULT_MAX_ITERATIONS = 8;

const NUDGE =
  "You did not call the tool. Call it now with everything you have; leave fields empty rather than inventing content.";

const findToolUse = (
  message: Anthropic.Message,
  name: string,
): Anthropic.ToolUseBlock | undefined =>
  message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === name,
  );

/**
 * Runs one web-search-backed generation and returns a validated value.
 *
 * The structured result comes back through a strict tool rather than
 * `output_config.format`: web search attaches citations to text blocks, and
 * citations and a forced response format cannot be combined.
 *
 * The loop handles the two ways a search turn can end early — `pause_turn`
 * (the server tool hit its iteration limit) and a turn that produced text
 * instead of the tool call — and gives the model its own validation errors
 * back so it can correct them.
 */
export const runStructured = async <T>(
  client: MessagesClient,
  config: StructuredRunnerConfig,
  call: StructuredCall<T>,
  onProgress: ProgressListener = () => undefined,
): Promise<ProviderResult<T>> => {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const mapError = config.mapError ?? structuralErrorMapper;

  // One watch across every turn, so searches keep counting after a pause.
  let watch = startWatch(call.toolName, call.readItem ?? (() => undefined));
  const advance = (next: ProgressWatch): void => {
    const changed = next.progress !== watch.progress;
    watch = next;
    if (changed) onProgress(next.progress);
  };

  const tools = [
    ...(call.maxSearches > 0
      ? [webSearchTool(config.model, call.maxSearches, call.blockedDomains)]
      : []),
    {
      name: call.toolName,
      description: call.toolDescription,
      strict: true,
      input_schema: toolInputSchema(call.schema) as Anthropic.Tool["input_schema"],
    },
  ] as Anthropic.MessageCreateParamsStreaming["tools"];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: call.prompt }];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let message: Anthropic.Message;
    try {
      const events = await client.messages.create({
        model: config.model,
        max_tokens: call.maxTokens,
        // The system prompt is stable per call kind, so it is the cacheable prefix.
        system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
        thinking: { type: "adaptive" },
        output_config: { effort: call.effort },
        tools,
        messages,
        stream: true,
      });
      message = await collectMessage(events, (event) => advance(watchEvent(watch, event)));
    } catch (error) {
      return err(mapError(error));
    }

    if (message.stop_reason === "refusal") {
      return err(refused(message.stop_details?.explanation ?? ""));
    }

    const toolUse = findToolUse(message, call.toolName);
    if (toolUse) {
      const parsed = call.schema.safeParse(toolUse.input);
      if (parsed.success) return ok(parsed.data);

      // Hand the validation failure back so the model can fix its own output.
      advance(fixing(watch));
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: `Schema validation failed: ${parsed.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("; ")}`,
          },
        ],
      });
      continue;
    }

    // A server tool ran out of iterations mid-turn; re-sending resumes it.
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    messages.push({ role: "assistant", content: message.content });
    messages.push({ role: "user", content: NUDGE });
  }

  return err(invalidOutput(`модель не вызвала ${call.toolName} за ${maxIterations} шагов`));
};
