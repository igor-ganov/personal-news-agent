import type Anthropic from "@anthropic-ai/sdk";

/**
 * Rebuilds a finished message from the raw server-sent events.
 *
 * The SDK's `MessageStream` does the same, but it is built for showing a
 * response as it arrives: it copies the growing block on every delta, emits an
 * event per delta, and parses tool input with a hand-written partial-JSON
 * parser. None of that is needed for a result that is only read once it is
 * complete, and on a Worker every one of those cycles is billed against a
 * thirty-second CPU budget. Here a delta is a string append, and a tool's input
 * is parsed exactly once, natively, when its block closes.
 */

type ContentBlock = Anthropic.ContentBlock;
type StreamEvent = Anthropic.RawMessageStreamEvent;
type Delta = Anthropic.RawContentBlockDelta;

/** A block being assembled. Tool input arrives as JSON text, parsed at the end. */
interface Draft {
  readonly block: ContentBlock;
  readonly json?: string;
}

export interface Accumulation {
  readonly message?: Anthropic.Message;
  readonly drafts: readonly Draft[];
}

export const emptyAccumulation: Accumulation = { drafts: [] };

const tracksInput = (block: ContentBlock): boolean =>
  block.type === "tool_use" || block.type === "server_tool_use";

const startDraft = (block: ContentBlock): Draft =>
  tracksInput(block) ? { block, json: "" } : { block };

/* ----------------------------------------------------------------- deltas -- */

/** Applies one delta to the block it targets; a mismatched delta is ignored. */
const applyDelta = (draft: Draft, delta: Delta): Draft => {
  const { block } = draft;
  switch (delta.type) {
    case "text_delta":
      return block.type === "text" ? { block: { ...block, text: block.text + delta.text } } : draft;
    case "citations_delta":
      return block.type === "text"
        ? { block: { ...block, citations: [...(block.citations ?? []), delta.citation] } }
        : draft;
    case "thinking_delta":
      return block.type === "thinking"
        ? { block: { ...block, thinking: block.thinking + delta.thinking } }
        : draft;
    case "signature_delta":
      return block.type === "thinking" ? { block: { ...block, signature: delta.signature } } : draft;
    case "input_json_delta":
      return draft.json === undefined ? draft : { block, json: draft.json + delta.partial_json };
  }
};

/** Closes a block: tool input is parsed here, once. An empty input is `{}`. */
const finishDraft = (draft: Draft): Draft => {
  if (draft.json === undefined) return draft;
  const { block } = draft;
  const input: unknown = draft.json === "" ? {} : JSON.parse(draft.json);
  return block.type === "tool_use" || block.type === "server_tool_use"
    ? { block: { ...block, input } }
    : { block };
};

const updateAt = (
  drafts: readonly Draft[],
  index: number,
  update: (draft: Draft) => Draft,
): readonly Draft[] => drafts.map((draft, i) => (i === index ? update(draft) : draft));

/* ---------------------------------------------------------------- message -- */

/**
 * The counters in `message_delta` are whole-message totals, sent only when they
 * apply — so a present value replaces, an absent one keeps what came before.
 */
const mergeUsage = (usage: Anthropic.Usage, delta: Anthropic.MessageDeltaUsage): Anthropic.Usage => ({
  ...usage,
  output_tokens: delta.output_tokens,
  input_tokens: delta.input_tokens ?? usage.input_tokens,
  cache_creation_input_tokens: delta.cache_creation_input_tokens ?? usage.cache_creation_input_tokens,
  cache_read_input_tokens: delta.cache_read_input_tokens ?? usage.cache_read_input_tokens,
  server_tool_use: delta.server_tool_use ?? usage.server_tool_use,
  output_tokens_details: delta.output_tokens_details ?? usage.output_tokens_details,
});

const applyMessageDelta = (
  message: Anthropic.Message,
  event: Anthropic.RawMessageDeltaEvent,
): Anthropic.Message => ({
  ...message,
  stop_reason: event.delta.stop_reason,
  stop_sequence: event.delta.stop_sequence,
  stop_details: event.delta.stop_details,
  container: event.delta.container ?? message.container,
  usage: mergeUsage(message.usage, event.usage),
});

/* ---------------------------------------------------------------- reducer -- */

/** Folds one event into the accumulation. Pure: the input is never modified. */
export const accumulate = (state: Accumulation, event: StreamEvent): Accumulation => {
  switch (event.type) {
    case "message_start":
      return { message: event.message, drafts: event.message.content.map(startDraft) };
    case "content_block_start":
      return { ...state, drafts: [...state.drafts, startDraft(event.content_block)] };
    case "content_block_delta":
      return { ...state, drafts: updateAt(state.drafts, event.index, (d) => applyDelta(d, event.delta)) };
    case "content_block_stop":
      return { ...state, drafts: updateAt(state.drafts, event.index, finishDraft) };
    case "message_delta":
      return state.message ? { ...state, message: applyMessageDelta(state.message, event) } : state;
    case "message_stop":
      return state;
  }
};

/**
 * The finished message, ready to be read or replayed as assistant content.
 * A stream that never said `message_start` produced nothing usable.
 */
export const finalMessage = (state: Accumulation): Anthropic.Message => {
  if (!state.message) throw new Error("stream ended before message_start");
  return { ...state.message, content: state.drafts.map((draft) => finishDraft(draft).block) };
};

/** Drains a raw event stream into the message it describes. */
export const collectMessage = async (
  events: AsyncIterable<StreamEvent>,
): Promise<Anthropic.Message> => {
  let state = emptyAccumulation;
  for await (const event of events) state = accumulate(state, event);
  return finalMessage(state);
};
