import { describe, expect, it } from "vitest";
import { sequentialIds, type SourceId, type TopicId } from "../model/ids.js";
import type { SourceCandidate } from "../model/source.js";
import { makeSource, T0 } from "../testing/builders.js";
import { instantOf } from "../time/instant.js";
import { mergeDiscoveredSources, needsSourceRefresh } from "./merge.js";

const topicId = "topic_1" as TopicId;
const T1 = instantOf("2026-08-29T10:00:00Z");

const candidate = (over: Partial<SourceCandidate> = {}): SourceCandidate => ({
  title: "Simon Willison",
  url: "https://simonwillison.net/atom/everything/",
  kind: "rss",
  rationale: "Ежедневно пишет про LLM-инструменты",
  ...over,
});

const merge = (
  existing: Parameters<typeof mergeDiscoveredSources>[0]["existing"],
  candidates: readonly SourceCandidate[],
  now = T1,
) => mergeDiscoveredSources({ existing, candidates, topicId, ids: sequentialIds(), now });

describe("mergeDiscoveredSources", () => {
  it("adds a new source as discovered and active", () => {
    const outcome = merge([], [candidate()]);
    expect(outcome.added).toHaveLength(1);
    expect(outcome.added[0]).toMatchObject({
      id: "source_1",
      topicId,
      origin: "discovered",
      status: "active",
      key: "simonwillison.net/atom/everything",
      addedAt: T1,
      lastConfirmedAt: T1,
    });
    expect(outcome.sources).toHaveLength(1);
  });

  it("never resurrects a blacklisted source, whatever the URL shape", () => {
    const blocked = makeSource({
      key: "simonwillison.net/atom/everything",
      status: "blacklisted",
      origin: "user",
    });
    const outcome = merge([blocked], [
      candidate({ url: "http://WWW.simonwillison.net/atom/everything/?utm_source=x" }),
    ]);

    expect(outcome.added).toEqual([]);
    expect(outcome.rejected).toEqual([
      { candidate: expect.objectContaining({ title: "Simon Willison" }), reason: "blacklisted" },
    ]);
    expect(outcome.sources).toEqual([blocked]);
  });

  it("refreshes a previously discovered source in place", () => {
    const existing = makeSource({
      id: "source_9" as SourceId,
      key: "simonwillison.net/atom/everything",
      title: "Старое имя",
      rationale: "старая причина",
      lastConfirmedAt: null,
    });
    const outcome = merge([existing], [candidate({ title: "Новое имя", rationale: "новая причина" })]);

    expect(outcome.added).toEqual([]);
    expect(outcome.sources).toHaveLength(1);
    expect(outcome.sources[0]).toMatchObject({
      id: "source_9",
      title: "Новое имя",
      rationale: "новая причина",
      lastConfirmedAt: T1,
    });
  });

  it("does not overwrite what the user wrote by hand", () => {
    const userSource = makeSource({
      key: "simonwillison.net/atom/everything",
      origin: "user",
      title: "Мой заголовок",
      rationale: "моя причина",
    });
    const outcome = merge([userSource], [candidate({ title: "Авто", rationale: "авто" })]);

    expect(outcome.sources[0]).toMatchObject({
      title: "Мой заголовок",
      rationale: "моя причина",
      lastConfirmedAt: T1,
    });
  });

  it("keeps a muted source muted while still refreshing it", () => {
    const muted = makeSource({ key: "simonwillison.net/atom/everything", status: "muted" });
    const outcome = merge([muted], [candidate()]);
    expect(outcome.sources[0]!.status).toBe("muted");
    expect(outcome.refreshed).toHaveLength(1);
  });

  it("collapses duplicates inside one batch", () => {
    const outcome = merge([], [
      candidate(),
      candidate({ url: "https://simonwillison.net/atom/everything?utm_campaign=y" }),
    ]);
    expect(outcome.added).toHaveLength(1);
    expect(outcome.rejected.map((r) => r.reason)).toEqual(["duplicate"]);
  });

  it("rejects unusable urls", () => {
    const outcome = merge([], [candidate({ url: "not a url" })]);
    expect(outcome.added).toEqual([]);
    expect(outcome.rejected.map((r) => r.reason)).toEqual(["invalid-url"]);
  });

  it("leaves untouched sources exactly as they were", () => {
    const other = makeSource({ id: "source_other" as SourceId, key: "other.com/feed" });
    const outcome = merge([other], [candidate()]);
    expect(outcome.sources[0]).toBe(other);
    expect(outcome.sources).toHaveLength(2);
  });
});

describe("needsSourceRefresh", () => {
  it("always refreshes an empty list", () => {
    expect(needsSourceRefresh([], T1, 7)).toBe(true);
  });

  it("refreshes a list where only blacklisted sources remain", () => {
    expect(needsSourceRefresh([makeSource({ status: "blacklisted" })], T1, 7)).toBe(true);
  });

  it("waits until the refresh interval has elapsed", () => {
    const sources = [makeSource({ lastConfirmedAt: T0 })];
    expect(needsSourceRefresh(sources, instantOf("2026-08-27T10:00:00Z"), 7)).toBe(false);
    expect(needsSourceRefresh(sources, instantOf("2026-08-29T10:00:00Z"), 7)).toBe(true);
  });

  it("uses the most recent confirmation across the list", () => {
    const sources = [
      makeSource({ id: "a" as SourceId, key: "a", lastConfirmedAt: instantOf("2026-01-01T00:00:00Z") }),
      makeSource({ id: "b" as SourceId, key: "b", lastConfirmedAt: T1 }),
    ];
    expect(needsSourceRefresh(sources, T1, 7)).toBe(false);
  });

  it("falls back to addedAt when a source was never re-confirmed", () => {
    const sources = [makeSource({ addedAt: T0, lastConfirmedAt: null })];
    expect(needsSourceRefresh(sources, instantOf("2026-09-30T10:00:00Z"), 7)).toBe(true);
  });
});
