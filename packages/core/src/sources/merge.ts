import type { IdFactory, SourceId, TopicId } from "../model/ids.js";
import type { Source, SourceCandidate } from "../model/source.js";
import { daysBetween, type Instant } from "../time/instant.js";
import { canonicalSourceUrl, normaliseSourceUrl } from "./url.js";

export type RejectionReason = "invalid-url" | "blacklisted" | "duplicate";

export interface RejectedCandidate {
  readonly candidate: SourceCandidate;
  readonly reason: RejectionReason;
}

export interface MergeOutcome {
  /** The full source list for the topic after the merge. */
  readonly sources: readonly Source[];
  readonly added: readonly Source[];
  readonly refreshed: readonly Source[];
  readonly rejected: readonly RejectedCandidate[];
}

export interface MergeInput {
  readonly existing: readonly Source[];
  readonly candidates: readonly SourceCandidate[];
  readonly topicId: TopicId;
  readonly ids: IdFactory;
  readonly now: Instant;
}

/**
 * Folds freshly discovered candidates into an existing source list.
 *
 * Three rules, in this order:
 *  1. A blacklisted source is never resurrected — that is what the blacklist is for.
 *  2. A source the user added or edited by hand keeps its own title and rationale;
 *     discovery only refreshes its `lastConfirmedAt`.
 *  3. Anything else is either refreshed in place or added as a new `discovered` source.
 */
export const mergeDiscoveredSources = (input: MergeInput): MergeOutcome => {
  const byKey = new Map(input.existing.map((s) => [s.key, s]));
  const added: Source[] = [];
  const refreshed: Source[] = [];
  const rejected: RejectedCandidate[] = [];
  const seenInBatch = new Set<string>();
  const updates = new Map<string, Source>();

  for (const candidate of input.candidates) {
    const normalised = normaliseSourceUrl(candidate.url);
    const canonical = canonicalSourceUrl(candidate.url);
    if (!normalised.ok || !canonical.ok) {
      rejected.push({ candidate, reason: "invalid-url" });
      continue;
    }

    const key = normalised.value;
    if (seenInBatch.has(key)) {
      rejected.push({ candidate, reason: "duplicate" });
      continue;
    }
    seenInBatch.add(key);

    const existing = byKey.get(key);

    if (existing?.status === "blacklisted") {
      rejected.push({ candidate, reason: "blacklisted" });
      continue;
    }

    if (existing) {
      const updated: Source =
        existing.origin === "user"
          ? { ...existing, lastConfirmedAt: input.now }
          : {
              ...existing,
              title: candidate.title.trim() || existing.title,
              kind: candidate.kind,
              rationale: candidate.rationale.trim() || existing.rationale,
              lastConfirmedAt: input.now,
            };
      updates.set(key, updated);
      refreshed.push(updated);
      continue;
    }

    const source: Source = {
      id: input.ids.next("source") as SourceId,
      topicId: input.topicId,
      title: candidate.title.trim(),
      url: canonical.value,
      key,
      kind: candidate.kind,
      origin: "discovered",
      status: "active",
      rationale: candidate.rationale.trim(),
      addedAt: input.now,
      lastConfirmedAt: input.now,
    };
    updates.set(key, source);
    added.push(source);
  }

  const merged = input.existing.map((s) => updates.get(s.key) ?? s);
  return { sources: [...merged, ...added], added, refreshed, rejected };
};

/**
 * Whether auto-discovery should run again for a topic.
 * An empty list always needs a run; otherwise it is driven by the oldest confirmation.
 */
export const needsSourceRefresh = (
  sources: readonly Source[],
  now: Instant,
  refreshDays: number,
): boolean => {
  const managed = sources.filter((s) => s.status !== "blacklisted");
  if (managed.length === 0) return true;

  const lastRun = managed
    .map((s) => s.lastConfirmedAt ?? s.addedAt)
    .reduce<Instant | null>((latestSoFar, at) => (latestSoFar && latestSoFar > at ? latestSoFar : at), null);

  if (!lastRun) return true;
  return daysBetween(lastRun, now) >= refreshDays;
};
