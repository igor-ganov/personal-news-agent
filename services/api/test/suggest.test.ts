import { createMockProvider } from "@pna/agent";
import { describe, expect, it } from "vitest";
import type { RunnerDeps } from "../src/jobs/runner.js";
import { readSetupRequest, readSuggestRequest, setupFor, suggestFor } from "../src/suggest.js";

const context = {
  topic: { title: "Rust" },
  path: [],
  focusAreas: [],
  excludes: [],
  level: "intermediate",
  language: "ru",
};

const deps = (configured: boolean): RunnerDeps => ({
  credentials: async () => (configured ? { apiKey: "k", model: "m" } : undefined),
  provider: () => createMockProvider(),
});

describe("suggestions request", () => {
  it("reads a request and caps the batch at ten", () => {
    const read = readSuggestRequest({ kind: "skill", context, exclude: [" A ", 3, ""], count: 50 });
    expect(read).toMatchObject({ kind: "skill", exclude: ["A"], count: 10 });
  });

  it("refuses an unknown kind or a missing context", () => {
    expect(readSuggestRequest({ kind: "poem", context })).toBeUndefined();
    expect(readSuggestRequest({ kind: "skill" })).toBeUndefined();
  });

  it("answers with ideas the request did not exclude", async () => {
    const input = readSuggestRequest({ kind: "subtopic", context, exclude: ["Подтема 1: Rust"], count: 3 });
    const result = input ? await suggestFor(deps(true), "acc", input) : undefined;
    expect(result?.ok && result.value.map((idea) => idea.title)).toEqual([
      "Подтема 2: Rust",
      "Подтема 3: Rust",
      "Подтема 4: Rust",
    ]);
  });

  it("says so when the account has no key to generate with", async () => {
    const input = readSuggestRequest({ kind: "skill", context });
    const result = input ? await suggestFor(deps(false), "acc", input) : undefined;
    expect(result?.ok).toBe(false);
  });
});

describe("setup request — settings from a typed name", () => {
  it("reads a topic request with or without a context", () => {
    expect(readSetupRequest({ kind: "topic", title: " Rust ", language: "en" })).toEqual({
      kind: "topic",
      title: "Rust",
      language: "en",
    });
    expect(readSetupRequest({ kind: "skill", title: "Async", context })).toMatchObject({
      kind: "skill",
      language: "ru",
      context,
    });
  });

  it("refuses an unknown kind or an empty name", () => {
    expect(readSetupRequest({ kind: "poem", title: "x" })).toBeUndefined();
    expect(readSetupRequest({ kind: "topic", title: "  " })).toBeUndefined();
  });

  it("answers with settings that follow the name", async () => {
    const input = readSetupRequest({ kind: "skill", title: "Async", context });
    const result = input ? await setupFor(deps(true), "acc", input) : undefined;
    expect(result?.ok && result.value).toMatchObject({ kind: "skill", weeks: 6 });
  });

  it("says so when the account has no key to generate with", async () => {
    const input = readSetupRequest({ kind: "topic", title: "Rust" });
    const result = input ? await setupFor(deps(false), "acc", input) : undefined;
    expect(result?.ok).toBe(false);
  });
});
