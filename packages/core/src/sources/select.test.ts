import { describe, expect, it } from "vitest";
import type { SourceId, TopicId } from "../model/ids.js";
import { makeSource } from "../testing/builders.js";
import {
  blacklistedHosts,
  blacklistedUrls,
  countByStatus,
  feedableSources,
  sourcesOfTopic,
  withStatus,
} from "./select.js";

const s = (id: string, over: Parameters<typeof makeSource>[0] = {}) =>
  makeSource({ id: id as SourceId, key: `${id}.com/feed`, ...over });

const sources = {
  a: s("a"),
  b: s("b", { status: "muted" }),
  c: s("c", { status: "blacklisted", url: "https://c.com/feed" }),
  d: s("d", { topicId: "topic_2" as TopicId }),
} as Record<SourceId, ReturnType<typeof s>>;

describe("source selectors", () => {
  it("filters by topic", () => {
    expect(sourcesOfTopic(sources, "topic_1" as TopicId).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(sourcesOfTopic(sources, "topic_2" as TopicId).map((x) => x.id)).toEqual(["d"]);
  });

  it("filters by status", () => {
    const list = Object.values(sources);
    expect(withStatus(list, "muted").map((x) => x.id)).toEqual(["b"]);
  });

  it("feeds digests from active sources only", () => {
    expect(feedableSources(Object.values(sources)).map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("exposes the blacklist as urls and as hosts", () => {
    const list = Object.values(sources);
    expect(blacklistedUrls(list)).toEqual(["https://c.com/feed"]);
    expect(blacklistedHosts(list)).toEqual(["c.com"]);
  });

  it("strips the port from blocked hosts and de-duplicates them", () => {
    const list = [
      s("x", { status: "blacklisted", key: "x.com:8443/a" }),
      s("y", { status: "blacklisted", key: "x.com/b" }),
    ];
    expect(blacklistedHosts(list)).toEqual(["x.com"]);
  });

  it("counts statuses", () => {
    expect(countByStatus(Object.values(sources))).toEqual({ active: 2, muted: 1, blacklisted: 1 });
  });
});
