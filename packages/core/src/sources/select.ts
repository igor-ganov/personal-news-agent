import { sortBy } from "../fp/array.js";
import type { SourceId, TopicId } from "../model/ids.js";
import type { Source, SourceStatus } from "../model/source.js";

export type SourceMap = Readonly<Record<SourceId, Source>>;

export const sourcesOfTopic = (sources: SourceMap, topicId: TopicId): Source[] =>
  sortBy(
    Object.values(sources).filter((s) => s.topicId === topicId),
    (s) => `${s.addedAt}|${s.id}`,
  );

export const withStatus = (sources: readonly Source[], status: SourceStatus): Source[] =>
  sources.filter((s) => s.status === status);

/** The sources a digest is actually allowed to draw on. */
export const feedableSources = (sources: readonly Source[]): Source[] =>
  sources.filter((s) => s.status === "active");

export const blacklistedUrls = (sources: readonly Source[]): string[] =>
  sources.filter((s) => s.status === "blacklisted").map((s) => s.url);

/** Hostnames to hand a web-search tool as a hard block list. */
export const blacklistedHosts = (sources: readonly Source[]): string[] => {
  const hosts = sources
    .filter((s) => s.status === "blacklisted")
    .map((s) => s.key.split("/")[0] ?? "")
    .filter((h) => h.length > 0)
    .map((h) => h.split(":")[0] ?? h);
  return [...new Set(hosts)];
};

export interface SourceCounts {
  readonly active: number;
  readonly muted: number;
  readonly blacklisted: number;
}

export const countByStatus = (sources: readonly Source[]): SourceCounts => ({
  active: withStatus(sources, "active").length,
  muted: withStatus(sources, "muted").length,
  blacklisted: withStatus(sources, "blacklisted").length,
});
