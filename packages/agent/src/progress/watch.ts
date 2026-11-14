import type Anthropic from "@anthropic-ai/sdk";
import { STARTED_PROGRESS, type GenerationProgress } from "@pna/core";

/**
 * Turns the raw event stream of a generation into `GenerationProgress`.
 *
 * It runs on every event the model sends, often on a Worker's metered CPU, so
 * it does only string appends and one bounded regex per tool-input delta. The
 * report the model writes is never parsed here: a reader looks at the last few
 * hundred characters for the latest complete title.
 */

type StreamEvent = Anthropic.RawMessageStreamEvent;

/** Finds the piece of the answer being written in the tail of the report's JSON. */
export type ItemReader = (tail: string) => string | undefined;

type Block = "search" | "report" | "other";

export interface ProgressWatch {
  readonly progress: GenerationProgress;
  readonly reportTool: string;
  readonly readItem: ItemReader;
  readonly block: Block;
  /** Search: the whole query JSON. Report: its last `TAIL` characters. */
  readonly buffer: string;
}

const TAIL = 600;
const MAX_ITEM = 140;
const MAX_HOSTS = 4;

export const startWatch = (reportTool: string, readItem: ItemReader): ProgressWatch => ({
  progress: STARTED_PROGRESS,
  reportTool,
  readItem,
  block: "other",
  buffer: "",
});

/** Returns the same progress object when nothing the user would see changed. */
const patch = (
  progress: GenerationProgress,
  next: Partial<GenerationProgress>,
): GenerationProgress => {
  const merged = { ...progress, ...next };
  const changed = (Object.keys(next) as (keyof GenerationProgress)[]).some(
    (key) => String(merged[key]) !== String(progress[key]),
  );
  return changed ? merged : progress;
};

const hostOf = (url: unknown): string | undefined => {
  if (typeof url !== "string") return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

const hostsOf = (content: unknown): readonly string[] =>
  Array.isArray(content)
    ? [...new Set(content.map((result: { url?: unknown }) => hostOf(result?.url)))]
        .filter((host): host is string => host !== undefined)
        .slice(0, MAX_HOSTS)
    : [];

const queryOf = (json: string): string => {
  try {
    const input: unknown = JSON.parse(json);
    const query = (input as { query?: unknown } | null)?.query;
    return typeof query === "string" ? query : "";
  } catch {
    return "";
  }
};

const opened = (watch: ProgressWatch, block: Anthropic.ContentBlock): ProgressWatch => {
  const base = { ...watch, buffer: "" };
  switch (block.type) {
    case "server_tool_use":
      return { ...base, block: "search", progress: patch(watch.progress, { stage: "searching" }) };
    case "web_search_tool_result":
      return {
        ...base,
        block: "other",
        progress: patch(watch.progress, { stage: "searching", found: hostsOf(block.content) }),
      };
    case "tool_use":
      return block.name === watch.reportTool
        ? { ...base, block: "report", progress: patch(watch.progress, { stage: "writing" }) }
        : { ...base, block: "other" };
    case "thinking":
    case "redacted_thinking":
      return { ...base, block: "other", progress: patch(watch.progress, { stage: "thinking" }) };
    default:
      return { ...base, block: "other" };
  }
};

const written = (watch: ProgressWatch, partial: string): ProgressWatch => {
  if (watch.block === "search") return { ...watch, buffer: watch.buffer + partial };
  if (watch.block !== "report") return watch;

  const buffer = (watch.buffer + partial).slice(-TAIL);
  const item = watch.readItem(buffer)?.slice(0, MAX_ITEM);
  const progress =
    item && item !== watch.progress.item
      ? patch(watch.progress, { item, items: watch.progress.items + 1 })
      : watch.progress;
  return { ...watch, buffer, progress };
};

const closed = (watch: ProgressWatch): ProgressWatch => {
  if (watch.block !== "search") return { ...watch, block: "other", buffer: "" };
  const query = queryOf(watch.buffer);
  return {
    ...watch,
    block: "other",
    buffer: "",
    progress: patch(watch.progress, { query, searches: watch.progress.searches + 1 }),
  };
};

/** Folds one stream event in. Pure; `progress` keeps its identity when unchanged. */
export const watchEvent = (watch: ProgressWatch, event: StreamEvent): ProgressWatch => {
  switch (event.type) {
    case "content_block_start":
      return opened(watch, event.content_block);
    case "content_block_delta":
      return event.delta.type === "input_json_delta" ? written(watch, event.delta.partial_json) : watch;
    case "content_block_stop":
      return closed(watch);
    default:
      return watch;
  }
};

/** The model got the format wrong and is being asked again. */
export const fixing = (watch: ProgressWatch): ProgressWatch => ({
  ...watch,
  progress: patch(watch.progress, { stage: "fixing" }),
});

/* ----------------------------------------------------------- item readers -- */

const unescape = (raw: string): string => {
  try {
    const value: unknown = JSON.parse(`"${raw}"`);
    return typeof value === "string" ? value : raw;
  } catch {
    return raw;
  }
};

const lastMatch = (pattern: RegExp, tail: string): string | undefined => {
  let last: string | undefined;
  for (const match of tail.matchAll(pattern)) last = match[1];
  return last;
};

/** The latest complete string value of `key` — a source's or a section's title. */
export const lastString = (key: string): ItemReader => {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
  return (tail) => {
    const raw = lastMatch(pattern, tail);
    return raw === undefined ? undefined : unescape(raw).trim() || undefined;
  };
};

/** The latest complete markdown heading inside an escaped string — a lecture's section. */
const HEADING = /(?:\\n|")#{1,4} ([^"\\]+)\\n/g;

export const lastHeading: ItemReader = (tail) => lastMatch(HEADING, tail)?.trim() || undefined;
