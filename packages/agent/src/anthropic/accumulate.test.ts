import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { eventsOf, streamOf } from "../testing/stream.js";
import { accumulate, collectMessage, emptyAccumulation, finalMessage } from "./accumulate.js";

type StreamEvent = Anthropic.RawMessageStreamEvent;

const usage: Anthropic.Usage = {
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  input_tokens: 120,
  output_tokens: 1,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: "standard",
};

const caller = { type: "direct" } as const;

const citation: Anthropic.CitationsWebSearchResultLocation = {
  type: "web_search_result_location",
  cited_text: "vLLM 0.9 ships",
  encrypted_index: "enc",
  title: "vLLM blog",
  url: "https://blog.vllm.ai/",
};

const searchResult: Anthropic.WebSearchToolResultBlock = {
  type: "web_search_tool_result",
  tool_use_id: "srvtoolu_1",
  caller,
  content: [
    {
      type: "web_search_result",
      title: "vLLM blog",
      url: "https://blog.vllm.ai/",
      encrypted_content: "enc",
      page_age: null,
    },
  ],
};

const delta = (index: number, value: Anthropic.RawContentBlockDelta): StreamEvent => ({
  type: "content_block_delta",
  index,
  delta: value,
});

/** Shaped after a recorded search-and-emit turn: thinking, search, text, tool call. */
const recorded: StreamEvent[] = [
  {
    type: "message_start",
    message: {
      id: "msg_01",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      container: null,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      stop_details: null,
      usage,
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
  delta(0, { type: "thinking_delta", thinking: "Search " }),
  delta(0, { type: "thinking_delta", thinking: "first." }),
  delta(0, { type: "signature_delta", signature: "sig==" }),
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {}, caller },
  },
  delta(1, { type: "input_json_delta", partial_json: '{"query": "vl' }),
  delta(1, { type: "input_json_delta", partial_json: 'lm release"}' }),
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: searchResult },
  { type: "content_block_stop", index: 2 },
  { type: "content_block_start", index: 3, content_block: { type: "text", text: "", citations: null } },
  delta(3, { type: "text_delta", text: "vLLM 0.9 " }),
  delta(3, { type: "citations_delta", citation }),
  delta(3, { type: "text_delta", text: "is out." }),
  { type: "content_block_stop", index: 3 },
  {
    type: "content_block_start",
    index: 4,
    content_block: { type: "tool_use", id: "toolu_1", name: "emit_sources", input: {}, caller },
  },
  delta(4, { type: "input_json_delta", partial_json: "" }),
  delta(4, { type: "input_json_delta", partial_json: '{"sources": [{"title": "vLLM",' }),
  delta(4, { type: "input_json_delta", partial_json: ' "url": "https://blog.vllm.ai/feed"}]}' }),
  { type: "content_block_stop", index: 4 },
  {
    type: "content_block_start",
    index: 5,
    content_block: { type: "tool_use", id: "toolu_2", name: "noop", input: {}, caller },
  },
  { type: "content_block_stop", index: 5 },
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null, stop_details: null, container: null },
    usage: {
      output_tokens: 4321,
      input_tokens: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: 900,
      server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
      output_tokens_details: null,
    },
  },
  { type: "message_stop" },
];

describe("accumulate", () => {
  const message = finalMessage(recorded.reduce(accumulate, emptyAccumulation));

  it("assembles every kind of block the turn produced, in order", () => {
    expect(message.content).toEqual([
      { type: "thinking", thinking: "Search first.", signature: "sig==" },
      {
        type: "server_tool_use",
        id: "srvtoolu_1",
        name: "web_search",
        input: { query: "vllm release" },
        caller,
      },
      searchResult,
      { type: "text", text: "vLLM 0.9 is out.", citations: [citation] },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "emit_sources",
        input: { sources: [{ title: "vLLM", url: "https://blog.vllm.ai/feed" }] },
        caller,
      },
      { type: "tool_use", id: "toolu_2", name: "noop", input: {}, caller },
    ]);
  });

  it("takes the stop reason and the final usage from message_delta", () => {
    expect(message.stop_reason).toBe("tool_use");
    expect(message.usage).toMatchObject({
      input_tokens: 120,
      output_tokens: 4321,
      cache_read_input_tokens: 900,
      server_tool_use: { web_search_requests: 1 },
    });
  });

  it("leaves nothing but API fields on a block, so the content replays as-is", () => {
    const replay: Anthropic.MessageParam = { role: "assistant", content: message.content };
    expect(JSON.parse(JSON.stringify(replay))).toEqual(replay);
  });

  it("does not modify the state it folds", () => {
    const before = recorded.slice(0, 3).reduce(accumulate, emptyAccumulation);
    const snapshot = JSON.stringify(before);
    accumulate(before, delta(0, { type: "thinking_delta", thinking: "more" }));
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("drains an async stream to the same message", async () => {
    expect(await collectMessage(streamOf(recorded))).toEqual(message);
  });

  it("round-trips a message through its own event stream", async () => {
    expect(await collectMessage(streamOf(eventsOf(message)))).toEqual(message);
  });

  it("refuses a stream that never started a message", () => {
    expect(() => finalMessage(emptyAccumulation)).toThrow("message_start");
  });
});
