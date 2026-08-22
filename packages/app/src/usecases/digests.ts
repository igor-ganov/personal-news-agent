import {
  blacklistedHosts,
  digestId,
  err,
  feedableSources,
  ok,
  periodWindow,
  sourcesOfTopic,
  topicContextOf,
  type Digest,
  type DigestPeriod,
  type Result,
  type TopicId,
  type WindowMode,
} from "@pna/core";
import type { AppContext } from "../container.js";
import { domainError, type AppError } from "../errors.js";

/** How many digests to keep per topic and period before pruning. */
export const DIGEST_HISTORY = 6;

export const digestTaskKey = (topicId: TopicId, period: DigestPeriod): string =>
  `digest:${topicId}:${period}`;

export interface GenerateDigestInput {
  readonly topicId: TopicId;
  readonly period: DigestPeriod;
  /** "Что нового за день" is rolling; a scheduled digest uses `calendar-previous`. */
  readonly mode?: WindowMode;
}

/**
 * Produces the digest for a window and files it under the topic.
 *
 * Only active sources are handed to the provider — muted ones stay out of the
 * result without being forgotten, and blacklisted ones are turned into a hard
 * block list for the search.
 */
export const generateDigest = async (
  ctx: AppContext,
  input: GenerateDigestInput,
): Promise<Result<Digest, AppError>> => {
  const state = ctx.store.getState();
  const context = topicContextOf(state.topics, input.topicId);
  if (!context.ok) return err(domainError(context.error));

  const now = ctx.deps.clock.now();
  const all = sourcesOfTopic(state.sources, input.topicId);
  const sources = feedableSources(all);
  const window = periodWindow(input.period, now, input.mode ?? "rolling");

  const draft = await ctx.deps.provider.buildDigest({
    context: context.value,
    period: input.period,
    window,
    sources,
    blockedHosts: blacklistedHosts(all),
    now,
  });
  if (!draft.ok) return err(draft.error);

  const digest: Digest = {
    id: digestId(ctx.deps.ids.next("digest")),
    topicId: input.topicId,
    period: input.period,
    window,
    generatedAt: now,
    headline: draft.value.headline,
    summary: draft.value.summary,
    sections: draft.value.sections,
    sourceIds: sources.map((s) => s.id),
  };

  ctx.store.dispatch({ type: "digests/upsert", digest });
  ctx.store.dispatch({ type: "digests/prune", keepPerPeriod: DIGEST_HISTORY });
  return ok(digest);
};
