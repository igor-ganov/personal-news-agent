import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { T0, testContext, testLesson } from "../testing/fixtures.js";
import type { MessagesClient } from "./structured.js";
import { createAnthropicProviderWith } from "./provider.js";

const emitting = (name: string, input: unknown) => {
  const create = vi.fn(
    async (_params: Anthropic.MessageCreateParamsNonStreaming) =>
      ({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5",
        content: [{ type: "tool_use", id: "tu_1", name, input }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }) as Anthropic.Message,
  );
  return { client: { messages: { create } } satisfies MessagesClient, create };
};

const context = testContext();

describe("AnthropicContentProvider", () => {
  it("maps discovered sources to domain candidates", async () => {
    const { client } = emitting("emit_sources", {
      sources: [{ title: " vLLM ", url: " https://blog.vllm.ai/feed ", kind: "rss", rationale: "релизы" }],
    });
    const provider = createAnthropicProviderWith(client);

    const result = await provider.discoverSources({
      context,
      known: [],
      blockedHosts: [],
      limit: 5,
      now: T0,
    });

    expect(result).toEqual({
      ok: true,
      value: [{ title: "vLLM", url: "https://blog.vllm.ai/feed", kind: "rss", rationale: "релизы" }],
    });
  });

  it("scales the search budget to the digest period", async () => {
    const { client, create } = emitting("emit_digest", {
      headline: "h",
      summary: "s",
      sections: [],
    });
    const provider = createAnthropicProviderWith(client);

    const window = { from: T0, to: T0 };
    await provider.buildDigest({ context, period: "day", window, sources: [], blockedHosts: [], now: T0 });
    await provider.buildDigest({ context, period: "year", window, sources: [], blockedHosts: [], now: T0 });

    const usesOf = (call: number) =>
      (create.mock.calls[call]![0].tools as unknown as Array<Record<string, unknown>>)[0]!.max_uses;
    expect(usesOf(0)).toBe(8);
    expect(usesOf(1)).toBe(20);
  });

  it("forwards the blacklist to the search tool for digests and lessons", async () => {
    const { client, create } = emitting("emit_digest", { headline: "h", summary: "s", sections: [] });
    const provider = createAnthropicProviderWith(client);

    await provider.buildDigest({
      context,
      period: "week",
      window: { from: T0, to: T0 },
      sources: [],
      blockedHosts: ["spam.example"],
      now: T0,
    });

    const tools = create.mock.calls[0]![0].tools as unknown as Array<Record<string, unknown>>;
    expect(tools[0]!.blocked_domains).toEqual(["spam.example"]);
  });

  it("uses the session length as the fallback lesson duration", async () => {
    const { client } = emitting("emit_program", {
      title: "П",
      goal: "Ц",
      rationale: "R",
      modules: [{ title: "М", objective: "", lessons: [{ title: "У", objective: "", estimated_minutes: 0 }] }],
    });
    const provider = createAnthropicProviderWith(client);

    const result = await provider.draftProgram({
      context,
      intent: "",
      weeks: 4,
      sessionsPerWeek: 3,
      minutesPerSession: 60,
      priorMaterial: [],
      continuation: "fresh",
      now: T0,
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.modules[0]!.lessons[0]!.estimatedMinutes).toBe(60);
  });

  it("keeps only cross-references the user actually has", async () => {
    const { client } = emitting("emit_lesson", {
      key_points: [],
      body: "тело",
      diagrams: [],
      links: [],
      news_hooks: [],
      prior_references: [{ lesson_id: "nope", title: "Выдумка", note: "" }],
    });
    const provider = createAnthropicProviderWith(client);

    const result = await provider.writeLesson({
      context,
      programTitle: "П",
      programGoal: "Ц",
      moduleTitle: "М",
      lesson: testLesson(),
      coveredInProgram: [],
      priorMaterial: [],
      blockedHosts: [],
      now: T0,
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.priorReferences).toEqual([]);
  });

  it("does not offer web search when building a quiz", async () => {
    const { client, create } = emitting("emit_quiz", { questions: [] });
    const provider = createAnthropicProviderWith(client);

    await provider.buildQuiz({
      context,
      lesson: testLesson(),
      lessonBody: "тело",
      keyPoints: [],
      questionCount: 5,
      now: T0,
    });

    const tools = create.mock.calls[0]![0].tools as unknown as Array<Record<string, unknown>>;
    expect(tools.map((t) => t.name)).toEqual(["emit_quiz"]);
  });

  it("uses the configured model", async () => {
    const { client, create } = emitting("emit_quiz", { questions: [] });
    const provider = createAnthropicProviderWith(client, { model: "claude-sonnet-5" });

    await provider.buildQuiz({
      context,
      lesson: testLesson(),
      lessonBody: "т",
      keyPoints: [],
      questionCount: 1,
      now: T0,
    });

    expect(create.mock.calls[0]![0].model).toBe("claude-sonnet-5");
  });

  it("propagates a provider error instead of throwing", async () => {
    const client: MessagesClient = {
      messages: {
        create: async () => {
          throw new Error("offline");
        },
      },
    };
    const provider = createAnthropicProviderWith(client);

    const result = await provider.discoverSources({
      context,
      known: [],
      blockedHosts: [],
      limit: 3,
      now: T0,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "unknown" } });
  });
});
