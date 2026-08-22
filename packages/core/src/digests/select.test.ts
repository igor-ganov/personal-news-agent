import { describe, expect, it } from "vitest";
import type { DigestId, TopicId } from "../model/ids.js";
import { makeDigest } from "../testing/builders.js";
import { instantOf } from "../time/instant.js";
import type { DigestMap } from "./select.js";
import {
  digestItemCount,
  digestItems,
  digestsOfPeriod,
  digestsOfTopic,
  isDigestStale,
  latestDigest,
  pruneDigests,
  stalePeriods,
} from "./select.js";

const topic1 = "topic_1" as TopicId;
const topic2 = "topic_2" as TopicId;

const d = (id: string, over: Parameters<typeof makeDigest>[0]) =>
  makeDigest({ id: id as DigestId, ...over });

const digests: DigestMap = Object.fromEntries(
  [
    d("old-day", { period: "day", generatedAt: instantOf("2026-08-20T10:00:00Z") }),
    d("new-day", { period: "day", generatedAt: instantOf("2026-08-22T09:00:00Z") }),
    d("week", { period: "week", generatedAt: instantOf("2026-08-21T10:00:00Z") }),
    d("other", { period: "day", topicId: topic2, generatedAt: instantOf("2026-08-22T11:00:00Z") }),
  ].map((x) => [x.id, x]),
);

describe("digest selectors", () => {
  it("lists a topic's digests newest first", () => {
    expect(digestsOfTopic(digests, topic1).map((x) => x.id)).toEqual(["new-day", "week", "old-day"]);
  });

  it("returns the whole history of a period, newest first", () => {
    expect(digestsOfPeriod(digests, topic1, "day").map((x) => x.id)).toEqual(["new-day", "old-day"]);
  });

  it("returns an empty history for a period that has nothing", () => {
    expect(digestsOfPeriod(digests, topic1, "month")).toEqual([]);
  });

  it("keeps one topic's history out of another's", () => {
    expect(digestsOfPeriod(digests, topic2, "day").map((x) => x.id)).toEqual(["other"]);
  });

  it("finds the latest digest for a period", () => {
    expect(latestDigest(digests, topic1, "day")?.id).toBe("new-day");
    expect(latestDigest(digests, topic1, "month")).toBeUndefined();
    expect(latestDigest(digests, topic2, "day")?.id).toBe("other");
  });

  it("counts a daily digest stale after six hours", () => {
    const digest = d("x", { period: "day", generatedAt: instantOf("2026-08-22T00:00:00Z") });
    expect(isDigestStale(digest, instantOf("2026-08-22T05:59:00Z"))).toBe(false);
    expect(isDigestStale(digest, instantOf("2026-08-22T06:00:00Z"))).toBe(true);
  });

  it("gives longer periods a longer shelf life", () => {
    const yearly = d("y", { period: "year", generatedAt: instantOf("2026-08-01T00:00:00Z") });
    expect(isDigestStale(yearly, instantOf("2026-08-10T00:00:00Z"))).toBe(false);
    expect(isDigestStale(yearly, instantOf("2026-08-16T00:00:00Z"))).toBe(true);
  });

  it("reports which periods need regenerating, including never-generated ones", () => {
    const now = instantOf("2026-08-22T20:00:00Z");
    expect(stalePeriods(digests, topic1, ["day", "week", "month"], now)).toEqual([
      "day",
      "week",
      "month",
    ]);
    expect(stalePeriods(digests, topic1, ["week"], instantOf("2026-08-22T09:00:00Z"))).toEqual([]);
  });

  it("flattens items across sections", () => {
    const digest = d("s", {
      sections: [
        {
          title: "Релизы",
          items: [
            {
              title: "A",
              url: "https://a",
              sourceTitle: "S",
              publishedAt: null,
              summary: "",
              relevance: "",
              tags: [],
            },
          ],
        },
        {
          title: "Статьи",
          items: [
            {
              title: "B",
              url: "https://b",
              sourceTitle: "S",
              publishedAt: null,
              summary: "",
              relevance: "",
              tags: [],
            },
          ],
        },
      ],
    });
    expect(digestItems(digest).map((i) => i.title)).toEqual(["A", "B"]);
    expect(digestItemCount(digest)).toBe(2);
  });
});

describe("pruneDigests", () => {
  it("keeps the newest N per topic and period", () => {
    const pruned = pruneDigests(digests, 1);
    expect(Object.keys(pruned).sort()).toEqual(["new-day", "other", "week"]);
  });

  it("keeps everything when the cap is generous", () => {
    expect(Object.keys(pruneDigests(digests, 10))).toHaveLength(4);
  });
});
