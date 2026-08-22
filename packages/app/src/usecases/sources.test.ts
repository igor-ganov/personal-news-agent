import type { ContentProvider } from "@pna/agent";
import { instantOf, sourcesOfTopic, type SourceCandidate, type SourceId, type TopicId } from "@pna/core";
import { describe, expect, it, vi } from "vitest";
import { failingProvider, harness } from "../testing/harness.js";
import { addTopic } from "./topics.js";
import {
  addSourceByHand,
  changeSourceStatus,
  editSourceDetails,
  ensureSourcesFresh,
  forgetSource,
  refreshTopicSources,
} from "./sources.js";

const proposing = (candidates: SourceCandidate[]): ContentProvider & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    id: "stub",
    discoverSources: vi.fn(async (input) => {
      calls.push(input);
      return { ok: true as const, value: candidates };
    }),
    buildDigest: async () => ({ ok: false, error: { kind: "unknown", message: "" } }),
    draftProgram: async () => ({ ok: false, error: { kind: "unknown", message: "" } }),
    writeLesson: async () => ({ ok: false, error: { kind: "unknown", message: "" } }),
    buildQuiz: async () => ({ ok: false, error: { kind: "unknown", message: "" } }),
  } as ContentProvider & { calls: unknown[] };
};

const candidate = (over: Partial<SourceCandidate> = {}): SourceCandidate => ({
  title: "vLLM blog",
  url: "https://blog.vllm.ai/feed",
  kind: "rss",
  rationale: "релизы",
  ...over,
});

const withTopic = (provider?: ContentProvider) => {
  const h = harness(provider ? { provider } : {});
  const created = addTopic(h.ctx, { parentId: null, title: "Инференс" });
  if (!created.ok) throw new Error("expected ok");
  return { ...h, topicId: created.value.id };
};

describe("refreshTopicSources", () => {
  it("adds what the provider proposes", async () => {
    const { ctx, state, topicId } = withTopic(proposing([candidate()]));
    const result = await refreshTopicSources(ctx, topicId);

    if (!result.ok) throw new Error("expected ok");
    expect(result.value.added).toHaveLength(1);
    expect(sourcesOfTopic(state().sources, topicId)).toHaveLength(1);
  });

  it("reports an unknown topic", async () => {
    const { ctx } = harness();
    expect(await refreshTopicSources(ctx, "ghost" as TopicId)).toEqual({
      ok: false,
      error: { kind: "domain", message: "Тема не найдена" },
    });
  });

  it("passes the provider error through untouched", async () => {
    const { ctx, topicId } = withTopic(failingProvider());
    expect(await refreshTopicSources(ctx, topicId)).toEqual({
      ok: false,
      error: { kind: "network", message: "нет сети" },
    });
  });

  it("hides blacklisted sources from the provider and hands it the hosts to avoid", async () => {
    const provider = proposing([]);
    const { ctx, topicId } = withTopic(provider);

    const added = addSourceByHand(ctx, topicId, { title: "Спам", url: "https://spam.example/feed" });
    if (!added.ok) throw new Error("expected ok");
    changeSourceStatus(ctx, added.value.id, "blacklisted");

    await refreshTopicSources(ctx, topicId, { force: true });

    const input = provider.calls.at(-1) as { known: unknown[]; blockedHosts: string[] };
    expect(input.known).toEqual([]);
    expect(input.blockedHosts).toEqual(["spam.example"]);
  });

  it("still refuses a blacklisted candidate the provider proposes anyway", async () => {
    const { ctx, topicId } = withTopic(proposing([candidate({ url: "https://spam.example/feed" })]));

    const added = addSourceByHand(ctx, topicId, { title: "Спам", url: "https://spam.example/feed" });
    if (!added.ok) throw new Error("expected ok");
    changeSourceStatus(ctx, added.value.id, "blacklisted");

    const result = await refreshTopicSources(ctx, topicId, { force: true });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.added).toEqual([]);
    expect(result.value.rejected.map((r) => r.reason)).toEqual(["blacklisted"]);
  });

  it("skips the call when the list is still fresh, unless forced", async () => {
    const provider = proposing([candidate()]);
    const { ctx, topicId } = withTopic(provider);

    await refreshTopicSources(ctx, topicId);
    await refreshTopicSources(ctx, topicId);
    expect(provider.calls).toHaveLength(1);

    await refreshTopicSources(ctx, topicId, { force: true });
    expect(provider.calls).toHaveLength(2);
  });

  it("refreshes again once the interval has passed", async () => {
    const provider = proposing([candidate()]);
    const { ctx, topicId } = withTopic(provider);
    await refreshTopicSources(ctx, topicId);

    const later = harness({
      provider,
      state: ctx.store.getState(),
      now: instantOf("2026-09-05T10:00:00Z"),
    });
    await refreshTopicSources(later.ctx, topicId);
    expect(provider.calls).toHaveLength(2);
  });
});

describe("ensureSourcesFresh", () => {
  it("does nothing when auto-refresh is off", async () => {
    const provider = proposing([candidate()]);
    const { ctx, topicId } = withTopic(provider);
    ctx.store.dispatch({ type: "settings/patch", patch: { autoRefreshSources: false } });

    await ensureSourcesFresh(ctx, topicId);
    expect(provider.calls).toHaveLength(0);
  });

  it("refreshes an empty list", async () => {
    const provider = proposing([candidate()]);
    const { ctx, topicId } = withTopic(provider);
    await ensureSourcesFresh(ctx, topicId);
    expect(provider.calls).toHaveLength(1);
  });
});

describe("manual source editing", () => {
  it("adds a source by hand as user-owned", () => {
    const { ctx, topicId } = withTopic();
    const result = addSourceByHand(ctx, topicId, { title: "Мой блог", url: "example.com/feed" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toMatchObject({ origin: "user", status: "active" });
  });

  it("rejects a duplicate and a bad url with a readable message", () => {
    const { ctx, topicId } = withTopic();
    addSourceByHand(ctx, topicId, { title: "A", url: "example.com/feed" });

    expect(addSourceByHand(ctx, topicId, { title: "A", url: "https://example.com/feed/" })).toEqual({
      ok: false,
      error: { kind: "domain", message: "Такой источник уже есть" },
    });
    expect(addSourceByHand(ctx, topicId, { title: "A", url: "нет" })).toEqual({
      ok: false,
      error: { kind: "domain", message: "Ссылка не похожа на адрес сайта" },
    });
  });

  it("editing a discovered source takes ownership of it", async () => {
    const { ctx, state, topicId } = withTopic(proposing([candidate()]));
    await refreshTopicSources(ctx, topicId);
    const id = sourcesOfTopic(state().sources, topicId)[0]!.id;

    editSourceDetails(ctx, id, { title: "Моё имя" });
    expect(state().sources[id]).toMatchObject({ title: "Моё имя", origin: "user" });
  });

  it("forgets a source entirely", () => {
    const { ctx, state, topicId } = withTopic();
    const added = addSourceByHand(ctx, topicId, { title: "A", url: "example.com/feed" });
    if (!added.ok) throw new Error("expected ok");

    forgetSource(ctx, added.value.id);
    expect(state().sources).toEqual({});
  });

  it("reports operations on an unknown source", () => {
    const { ctx } = harness();
    const unknown = { ok: false, error: { kind: "domain", message: "Источник не найден" } };
    expect(changeSourceStatus(ctx, "ghost" as SourceId, "muted")).toEqual(unknown);
    expect(editSourceDetails(ctx, "ghost" as SourceId, {})).toEqual(unknown);
    expect(forgetSource(ctx, "ghost" as SourceId)).toEqual(unknown);
  });
});
