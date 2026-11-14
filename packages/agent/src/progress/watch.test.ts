import type Anthropic from "@anthropic-ai/sdk";
import { STARTED_PROGRESS } from "@pna/core";
import { describe, expect, it } from "vitest";
import { eventsOf } from "../testing/stream.js";
import { lastHeading, lastString, startWatch, watchEvent, type ProgressWatch } from "./watch.js";

const REPORT = "emit_sources";

const message = (content: readonly unknown[]): Anthropic.Message =>
  ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }) as Anthropic.Message;

const search = (query: string) => ({ type: "server_tool_use", id: `s_${query}`, name: "web_search", input: { query } });
const results = (...urls: string[]) => ({
  type: "web_search_tool_result",
  tool_use_id: "s",
  content: urls.map((url) => ({ type: "web_search_result", url, title: url, encrypted_content: "", page_age: null })),
});
const report = (input: unknown) => ({ type: "tool_use", id: "t_1", name: REPORT, input });

/** Every progress the watcher reported while the message streamed, changes only. */
const reported = (content: readonly unknown[], read = lastString("title")): ProgressWatch["progress"][] => {
  const seen: ProgressWatch["progress"][] = [];
  let watch = startWatch(REPORT, read);
  for (const event of eventsOf(message(content))) {
    const next = watchEvent(watch, event);
    if (next.progress !== watch.progress) seen.push(next.progress);
    watch = next;
  }
  return seen;
};

describe("watching a generation stream", () => {
  it("says what is being searched once the query is complete", () => {
    const seen = reported([search("rust async runtimes")]);
    expect(seen.at(-1)).toMatchObject({ stage: "searching", query: "rust async runtimes", searches: 1 });
    // The half-typed query is never shown.
    expect(seen.every((p) => p.query === "" || p.query === "rust async runtimes")).toBe(true);
  });

  it("names the sites a search came back with, without repeats", () => {
    const seen = reported([
      search("q"),
      results("https://tokio.rs/blog/a", "https://tokio.rs/blog/b", "https://without.boats/x"),
    ]);
    expect(seen.at(-1)?.found).toEqual(["tokio.rs", "without.boats"]);
  });

  it("follows the report as it is written, item by item", () => {
    const seen = reported([
      report({ sources: [{ title: "Tokio blog", url: "u" }, { title: "Without boats", url: "v" }] }),
    ]);
    expect(seen.map((p) => p.item).filter((item) => item !== "")).toEqual(["Tokio blog", "Without boats"]);
    expect(seen.at(-1)).toMatchObject({ stage: "writing", items: 2 });
  });

  it("thinking between searches keeps what was found", () => {
    const seen = reported([
      search("q1"),
      { type: "thinking", thinking: "hmm", signature: "sig" },
    ]);
    expect(seen.at(-1)).toMatchObject({ stage: "thinking", query: "q1", searches: 1 });
  });

  it("text the model writes changes nothing", () => {
    expect(reported([{ type: "text", text: "Let me look.", citations: null }])).toEqual([]);
  });

  it("starts from the started state", () => {
    expect(startWatch(REPORT, lastString("title")).progress).toBe(STARTED_PROGRESS);
  });
});

describe("item readers", () => {
  it("lastString unescapes the value", () => {
    expect(lastString("title")('{"title":"A \\"quoted\\" one","x":1')).toBe('A "quoted" one');
  });

  it("lastString ignores a value still being typed", () => {
    expect(lastString("title")('{"title":"Done"},{"title":"Half')).toBe("Done");
  });

  it("lastHeading finds markdown headings inside an escaped body", () => {
    expect(lastHeading('{"body":"## Intro\\ntext\\n### Lifetimes in practice\\nmore')).toBe(
      "Lifetimes in practice",
    );
  });
});
