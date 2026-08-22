import { sortBy } from "../fp/array.js";
import type { Digest, DigestItem, DigestPeriod } from "../model/digest.js";
import type { DigestId, TopicId } from "../model/ids.js";
import { toEpochMs, type Instant } from "../time/instant.js";

export type DigestMap = Readonly<Record<DigestId, Digest>>;

/** How long a digest stays useful before it is worth regenerating. */
const STALE_AFTER_MS: Record<DigestPeriod, number> = {
  day: 6 * 3_600_000,
  week: 24 * 3_600_000,
  month: 3 * 24 * 3_600_000,
  year: 14 * 24 * 3_600_000,
};

export const digestsOfTopic = (digests: DigestMap, topicId: TopicId): Digest[] =>
  sortBy(
    Object.values(digests).filter((d) => d.topicId === topicId),
    (d) => d.generatedAt,
  ).reverse();

/** Every digest a topic has for one period, newest first — the history. */
export const digestsOfPeriod = (
  digests: DigestMap,
  topicId: TopicId,
  period: DigestPeriod,
): Digest[] => digestsOfTopic(digests, topicId).filter((d) => d.period === period);

export const latestDigest = (
  digests: DigestMap,
  topicId: TopicId,
  period: DigestPeriod,
): Digest | undefined => digestsOfPeriod(digests, topicId, period)[0];

export const isDigestStale = (digest: Digest, now: Instant): boolean =>
  toEpochMs(now) - toEpochMs(digest.generatedAt) >= STALE_AFTER_MS[digest.period];

/** Periods that should be regenerated for a topic right now. */
export const stalePeriods = (
  digests: DigestMap,
  topicId: TopicId,
  periods: readonly DigestPeriod[],
  now: Instant,
): DigestPeriod[] =>
  periods.filter((period) => {
    const latest = latestDigest(digests, topicId, period);
    return latest === undefined || isDigestStale(latest, now);
  });

export const digestItems = (digest: Digest): DigestItem[] =>
  digest.sections.flatMap((section) => [...section.items]);

export const digestItemCount = (digest: Digest): number => digestItems(digest).length;

/** Drops digests older than `keepPerPeriod` per period, per topic. */
export const pruneDigests = (digests: DigestMap, keepPerPeriod: number): DigestMap => {
  const kept = new Set<DigestId>();
  const byBucket = new Map<string, Digest[]>();

  for (const digest of Object.values(digests)) {
    const bucket = `${digest.topicId}|${digest.period}`;
    const list = byBucket.get(bucket) ?? [];
    list.push(digest);
    byBucket.set(bucket, list);
  }

  for (const list of byBucket.values()) {
    for (const digest of sortBy(list, (d) => d.generatedAt).reverse().slice(0, keepPerPeriod)) {
      kept.add(digest.id);
    }
  }

  return Object.fromEntries(
    Object.entries(digests).filter(([id]) => kept.has(id as DigestId)),
  ) as DigestMap;
};
