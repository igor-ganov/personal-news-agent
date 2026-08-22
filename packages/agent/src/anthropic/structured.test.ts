import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runStructured, type MessagesClient, type StructuredCall } from "./structured.js";

const schema = z.strictObject({ answer: z.string() });

const call: StructuredCall<{ answer: string }> = {
  system: "system",
  prompt: "prompt",
  toolName: "emit_answer",
  toolDescription: "Emit the answer",
  schema,
  maxTokens: 1000,
  maxSearches: 3,
  blockedDomains: [],
  effort: "high",
};

const message = (over: Partial<Anthropic.Message>): Anthropic.Message =>
  ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content: [],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    ...over,
  }) as Anthropic.Message;

const toolUse = (input: unknown, id = "tu_1") =>
  message({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name: "emit_answer", input } as Anthropic.ToolUseBlock],
  });

const text = (value: string) =>
  message({ content: [{ type: "text", text: value, citations: null } as Anthropic.TextBlock] });

const clientOf = (responses: Anthropic.Message[] | ((n: number) => Anthropic.Message)) => {
  const create = vi.fn(async (_params: Anthropic.MessageCreateParamsNonStreaming) => {
    const index = create.mock.calls.length - 1;
    return typeof responses === "function"
      ? responses(index)
      : (responses[index] ?? message({ stop_reason: "end_turn" }));
  });
  return { client: { messages: { create } } satisfies MessagesClient, create };
};

describe("runStructured", () => {
  it("returns the validated tool input", async () => {
    const { client } = clientOf([toolUse({ answer: "42" })]);
    expect(await runStructured(client, { model: "claude-opus-5" }, call)).toEqual({
      ok: true,
      value: { answer: "42" },
    });
  });

  it("sends the search tool and the strict emit tool together", async () => {
    const { client, create } = clientOf([toolUse({ answer: "42" })]);
    await runStructured(client, { model: "claude-opus-5" }, call);

    const params = create.mock.calls[0]![0];
    const tools = params.tools as unknown as Array<Record<string, unknown>>;
    expect(tools[0]).toMatchObject({ type: "web_search_20260209", name: "web_search", max_uses: 3 });
    expect(tools[1]).toMatchObject({ name: "emit_answer", strict: true });
    expect(tools[0]).not.toHaveProperty("blocked_domains");
  });

  it("passes the blacklist to the search tool when there is one", async () => {
    const { client, create } = clientOf([toolUse({ answer: "42" })]);
    await runStructured(client, { model: "claude-opus-5" }, { ...call, blockedDomains: ["spam.example"] });

    const tools = create.mock.calls[0]![0].tools as unknown as Array<Record<string, unknown>>;
    expect(tools[0]!.blocked_domains).toEqual(["spam.example"]);
  });

  it("falls back to the basic search tool on an older model", async () => {
    const { client, create } = clientOf([toolUse({ answer: "42" })]);
    await runStructured(client, { model: "claude-haiku-4-5" }, call);

    const tools = create.mock.calls[0]![0].tools as unknown as Array<Record<string, unknown>>;
    expect(tools[0]!.type).toBe("web_search_20250305");
  });

  it("offers no search tool when the call needs no search", async () => {
    const { client, create } = clientOf([toolUse({ answer: "42" })]);
    await runStructured(client, { model: "claude-opus-5" }, { ...call, maxSearches: 0 });

    const tools = create.mock.calls[0]![0].tools as unknown as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: "emit_answer" });
  });

  it("caches the system prompt and asks for the requested effort", async () => {
    const { client, create } = clientOf([toolUse({ answer: "42" })]);
    await runStructured(client, { model: "claude-opus-5" }, { ...call, effort: "max" });

    const params = create.mock.calls[0]![0];
    expect(params.system).toEqual([
      { type: "text", text: "system", cache_control: { type: "ephemeral" } },
    ]);
    expect(params.output_config).toEqual({ effort: "max" });
    expect(params.thinking).toEqual({ type: "adaptive" });
  });

  it("resumes a paused server-tool turn instead of giving up", async () => {
    const { client, create } = clientOf([
      message({ stop_reason: "pause_turn", content: [] }),
      toolUse({ answer: "42" }),
    ]);
    const result = await runStructured(client, { model: "claude-opus-5" }, call);

    expect(result).toEqual({ ok: true, value: { answer: "42" } });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0].messages).toHaveLength(2);
  });

  it("nudges a model that answered in plain text", async () => {
    const { client, create } = clientOf([text("Вот ответ: 42"), toolUse({ answer: "42" })]);
    const result = await runStructured(client, { model: "claude-opus-5" }, call);

    expect(result.ok).toBe(true);
    const followUp = create.mock.calls[1]![0].messages;
    expect(followUp).toHaveLength(3);
    expect(followUp[2]).toMatchObject({ role: "user" });
  });

  it("hands a schema violation back as a tool error and accepts the correction", async () => {
    const { client, create } = clientOf([toolUse({ wrong: true }), toolUse({ answer: "42" }, "tu_2")]);
    const result = await runStructured(client, { model: "claude-opus-5" }, call);

    expect(result).toEqual({ ok: true, value: { answer: "42" } });
    const retry = create.mock.calls[1]![0].messages;
    expect(retry[2]).toMatchObject({
      role: "user",
      content: [expect.objectContaining({ type: "tool_result", tool_use_id: "tu_1", is_error: true })],
    });
  });

  it("gives up after the iteration budget", async () => {
    const { client, create } = clientOf(() => text("всё ещё текст"));
    const result = await runStructured(client, { model: "claude-opus-5", maxIterations: 3 }, call);

    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid-output", message: expect.stringContaining("emit_answer") },
    });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("reports a policy refusal without retrying", async () => {
    const { client, create } = clientOf([
      message({
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: "нельзя" },
      } as Partial<Anthropic.Message>),
    ]);
    const result = await runStructured(client, { model: "claude-opus-5" }, call);

    expect(result).toEqual({ ok: false, error: { kind: "refused", message: "нельзя" } });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("surfaces a transport failure as a provider error", async () => {
    const client: MessagesClient = {
      messages: {
        create: async () => {
          throw new Error("socket hang up");
        },
      },
    };
    expect(await runStructured(client, { model: "claude-opus-5" }, call)).toEqual({
      ok: false,
      error: { kind: "unknown", message: "socket hang up" },
    });
  });
});
