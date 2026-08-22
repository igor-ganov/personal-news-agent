import { describe, expect, it } from "vitest";
import type { DigestId, TopicId } from "../model/ids.js";
import { emptyState, type AppState } from "../model/state.js";
import { makeDigest, makeTopic } from "../testing/builders.js";
import { instantOf } from "../time/instant.js";
import { reduceAll } from "./reduce.js";
import { topicOverview } from "./select.js";

const topic1 = "topic_1" as TopicId;
const topic2 = "topic_2" as TopicId;

const at = (s: string) => instantOf(s);

const seeded = (): AppState =>
  reduceAll(emptyState(), [
    { type: "topics/upsert", topic: makeTopic({ id: topic1 }) },
    { type: "topics/upsert", topic: makeTopic({ id: topic2 }) },
    {
      type: "digests/upsert",
      digest: makeDigest({ id: "d1" as DigestId, period: "day", generatedAt: at("2026-08-20T09:00:00Z") }),
    },
    {
      type: "digests/upsert",
      digest: makeDigest({ id: "d2" as DigestId, period: "day", generatedAt: at("2026-08-22T09:00:00Z") }),
    },
    {
      type: "digests/upsert",
      digest: makeDigest({ id: "d3" as DigestId, period: "day", generatedAt: at("2026-08-21T09:00:00Z") }),
    },
    {
      type: "digests/upsert",
      digest: makeDigest({ id: "w1" as DigestId, period: "week", generatedAt: at("2026-08-21T09:00:00Z") }),
    },
    {
      type: "digests/upsert",
      digest: makeDigest({
        id: "other" as DigestId,
        topicId: topic2,
        period: "day",
        generatedAt: at("2026-08-22T10:00:00Z"),
      }),
    },
  ]);

describe("topicOverview — digest history", () => {
  it("hands over the whole history for a period, newest first", () => {
    const overview = topicOverview(seeded(), topic1);
    expect(overview?.digests.day?.map((d) => d.id)).toEqual(["d2", "d3", "d1"]);
  });

  it("keeps periods apart", () => {
    const overview = topicOverview(seeded(), topic1);
    expect(overview?.digests.week?.map((d) => d.id)).toEqual(["w1"]);
  });

  it("omits a period that has nothing rather than handing back an empty list", () => {
    const overview = topicOverview(seeded(), topic1);
    expect(overview?.digests.month).toBeUndefined();
    expect(Object.keys(overview?.digests ?? {}).sort()).toEqual(["day", "week"]);
  });

  it("does not leak another topic's digests", () => {
    const overview = topicOverview(seeded(), topic1);
    expect(overview?.digests.day?.map((d) => d.id)).not.toContain("other");
    expect(topicOverview(seeded(), topic2)?.digests.day?.map((d) => d.id)).toEqual(["other"]);
  });

  it("returns nothing for an unknown topic", () => {
    expect(topicOverview(seeded(), "ghost" as TopicId)).toBeUndefined();
  });

  it("reports an empty history before anything was generated", () => {
    const state = reduceAll(emptyState(), [
      { type: "topics/upsert", topic: makeTopic({ id: topic1 }) },
    ]);
    expect(topicOverview(state, topic1)?.digests).toEqual({});
  });
});
