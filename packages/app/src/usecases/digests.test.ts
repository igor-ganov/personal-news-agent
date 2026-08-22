import type { ContentProvider } from "@pna/agent";
import { digestsOfPeriod, latestDigest, type DigestDraft, type TopicId } from "@pna/core";
import { describe, expect, it, vi } from "vitest";
import { failingProvider, harness } from "../testing/harness.js";
import { DIGEST_HISTORY, digestTaskKey, generateDigest } from "./digests.js";
import { addSourceByHand, changeSourceStatus } from "./sources.js";
import { addTopic } from "./topics.js";

const draft: DigestDraft = {
  headline: "Заголовок",
  summary: "Выжимка",
  sections: [
    {
      title: "Релизы",
      items: [
        {
          title: "vLLM 0.9",
          url: "https://blog.vllm.ai/x",
          sourceTitle: "vLLM",
          publishedAt: null,
          summary: "что вышло",
          relevance: "важно",
          tags: [],
        },
      ],
    },
  ],
  sourceIds: [],
};

const digesting = (): ContentProvider & { calls: any[] } => {
  const calls: any[] = [];
  return {
    calls,
    id: "stub",
    discoverSources: async () => ({ ok: true, value: [] }),
    buildDigest: vi.fn(async (input) => {
      calls.push(input);
      return { ok: true as const, value: draft };
    }),
    draftProgram: async () => ({ ok: false, error: { kind: "unknown", message: "" } }),
    writeLesson: async () => ({ ok: false, error: { kind: "unknown", message: "" } }),
    buildQuiz: async () => ({ ok: false, error: { kind: "unknown", message: "" } }),
  } as ContentProvider & { calls: any[] };
};

const withTopic = (provider: ContentProvider) => {
  const h = harness({ provider });
  const created = addTopic(h.ctx, { parentId: null, title: "Инференс" });
  if (!created.ok) throw new Error("expected ok");
  return { ...h, topicId: created.value.id };
};

describe("generateDigest", () => {
  it("stores the digest under the topic and period", async () => {
    const { ctx, state, topicId } = withTopic(digesting());
    const result = await generateDigest(ctx, { topicId, period: "week" });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({ topicId, period: "week", headline: "Заголовок" });
    expect(latestDigest(state().digests, topicId, "week")?.id).toBe(result.value.id);
  });

  it("defaults to a rolling window and honours an explicit mode", async () => {
    const provider = digesting();
    const { ctx, topicId } = withTopic(provider);

    await generateDigest(ctx, { topicId, period: "day" });
    expect(provider.calls[0].window).toEqual({
      from: "2026-08-21T10:00:00.000Z",
      to: "2026-08-22T10:00:00.000Z",
    });

    await generateDigest(ctx, { topicId, period: "day", mode: "calendar-previous" });
    expect(provider.calls[1].window).toEqual({
      from: "2026-08-21T00:00:00.000Z",
      to: "2026-08-22T00:00:00.000Z",
    });
  });

  it("feeds only active sources and blocks the blacklisted hosts", async () => {
    const provider = digesting();
    const { ctx, topicId } = withTopic(provider);

    const active = addSourceByHand(ctx, topicId, { title: "A", url: "a.example/feed" });
    const muted = addSourceByHand(ctx, topicId, { title: "B", url: "b.example/feed" });
    const banned = addSourceByHand(ctx, topicId, { title: "C", url: "c.example/feed" });
    if (!active.ok || !muted.ok || !banned.ok) throw new Error("expected ok");
    changeSourceStatus(ctx, muted.value.id, "muted");
    changeSourceStatus(ctx, banned.value.id, "blacklisted");

    await generateDigest(ctx, { topicId, period: "day" });

    expect(provider.calls[0].sources.map((s: { title: string }) => s.title)).toEqual(["A"]);
    expect(provider.calls[0].blockedHosts).toEqual(["c.example"]);
  });

  it("records which sources the digest was built from", async () => {
    const { ctx, topicId } = withTopic(digesting());
    const source = addSourceByHand(ctx, topicId, { title: "A", url: "a.example/feed" });
    if (!source.ok) throw new Error("expected ok");

    const result = await generateDigest(ctx, { topicId, period: "day" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.sourceIds).toEqual([source.value.id]);
  });

  it("adds to the history instead of replacing what is there", async () => {
    const { ctx, state, topicId } = withTopic(digesting());
    const first = await generateDigest(ctx, { topicId, period: "day" });
    const second = await generateDigest(ctx, { topicId, period: "day" });
    if (!first.ok || !second.ok) throw new Error("expected ok");

    const history = digestsOfPeriod(state().digests, topicId, "day");
    expect(history.map((d) => d.id)).toEqual([second.value.id, first.value.id]);
    expect(history[1]!.sections).toHaveLength(1);
  });

  it("keeps only the most recent digests per period", async () => {
    const { ctx, state, topicId } = withTopic(digesting());
    for (let i = 0; i < DIGEST_HISTORY + 3; i += 1) {
      await generateDigest(ctx, { topicId, period: "day" });
    }
    expect(Object.keys(state().digests)).toHaveLength(DIGEST_HISTORY);
  });

  it("reports an unknown topic and a provider failure", async () => {
    const { ctx } = harness();
    expect(await generateDigest(ctx, { topicId: "ghost" as TopicId, period: "day" })).toEqual({
      ok: false,
      error: { kind: "domain", message: "Тема не найдена" },
    });

    const failing = withTopic(failingProvider());
    expect(await generateDigest(failing.ctx, { topicId: failing.topicId, period: "day" })).toEqual({
      ok: false,
      error: { kind: "network", message: "нет сети" },
    });
  });
});

describe("digestTaskKey", () => {
  it("is unique per topic and period", () => {
    expect(digestTaskKey("t1" as TopicId, "day")).toBe("digest:t1:day");
    expect(digestTaskKey("t1" as TopicId, "week")).not.toBe(digestTaskKey("t1" as TopicId, "day"));
  });
});
