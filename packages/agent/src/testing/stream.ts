import type Anthropic from "@anthropic-ai/sdk";

/**
 * Plays a finished message back as the raw events the API would have sent:
 * blocks open empty, text and tool input arrive in small fragments, and the
 * stop reason and usage come last in `message_delta`. Lets tests drive the
 * streaming client with nothing more than the message they expect back.
 */

type StreamEvent = Anthropic.RawMessageStreamEvent;
type ContentBlock = Anthropic.ContentBlock;

const FRAGMENT = 7;

const fragments = (text: string): string[] =>
  Array.from({ length: Math.ceil(text.length / FRAGMENT) }, (_, i) =>
    text.slice(i * FRAGMENT, (i + 1) * FRAGMENT),
  );

const delta = (index: number, value: Anthropic.RawContentBlockDelta): StreamEvent => ({
  type: "content_block_delta",
  index,
  delta: value,
});

const blockEvents = (block: ContentBlock, index: number): StreamEvent[] => {
  const start = (content_block: ContentBlock): StreamEvent => ({
    type: "content_block_start",
    index,
    content_block,
  });
  const stop: StreamEvent = { type: "content_block_stop", index };

  switch (block.type) {
    case "text":
      return [
        start({ ...block, text: "", citations: null }),
        ...fragments(block.text).map((text) => delta(index, { type: "text_delta", text })),
        ...(block.citations ?? []).map((citation) => delta(index, { type: "citations_delta", citation })),
        stop,
      ];
    case "thinking":
      return [
        start({ ...block, thinking: "", signature: "" }),
        ...fragments(block.thinking).map((thinking) => delta(index, { type: "thinking_delta", thinking })),
        delta(index, { type: "signature_delta", signature: block.signature }),
        stop,
      ];
    case "tool_use":
    case "server_tool_use":
      return [
        start({ ...block, input: {} }),
        ...fragments(JSON.stringify(block.input)).map((partial_json) =>
          delta(index, { type: "input_json_delta", partial_json }),
        ),
        stop,
      ];
    default:
      return [start(block), stop];
  }
};

export const eventsOf = (message: Anthropic.Message): StreamEvent[] => [
  {
    type: "message_start",
    message: {
      ...message,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage: { ...message.usage, output_tokens: 1 },
    },
  },
  ...message.content.flatMap(blockEvents),
  {
    type: "message_delta",
    delta: {
      stop_reason: message.stop_reason,
      stop_sequence: message.stop_sequence,
      stop_details: message.stop_details,
      container: message.container,
    },
    usage: {
      output_tokens: message.usage.output_tokens,
      input_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: message.usage.server_tool_use,
      output_tokens_details: null,
    },
  },
  { type: "message_stop" },
];

/** The events as the SDK's `Stream` hands them out. */
export async function* streamOf(events: readonly StreamEvent[]): AsyncGenerator<StreamEvent> {
  yield* events;
}
