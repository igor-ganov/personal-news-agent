import {
  blacklistedHosts,
  err,
  feedableSources,
  ok,
  periodWindow,
  sourcesOfTopic,
  topicContextOf,
  type DigestDraft,
  type DigestPeriod,
  type Result,
  type TopicId,
  type WindowMode,
} from "@pna/core";
import type { AppContext } from "../container.js";
import { domainError, type AppError } from "../errors.js";
import { runGeneration, type Generation, type GenerationRequest } from "./jobs.js";

/**
 * How many digests to keep per topic and period.
 *
 * A digest is content the user asked for and may want to re-read, so the
 * history is kept rather than overwritten. The cap exists because the whole
 * state is one serialised document: twenty per period is a long trail for a
 * personal app while staying far away from the storage quota.
 */
export const DIGEST_HISTORY = 20;

export const digestTaskKey = (topicId: TopicId, period: DigestPeriod): string =>
  `digest:${topicId}:${period}`;

export interface GenerateDigestInput {
  readonly topicId: TopicId;
  readonly period: DigestPeriod;
  /** "Что нового за день" is rolling; a scheduled digest uses `calendar-previous`. */
  readonly mode?: WindowMode;
}

/**
 * Describes the digest to produce.
 *
 * Building the request is separate from running it because the same
 * description is used twice: once to start the work, and once — as the job's
 * `meta` — to file the answer when it comes back, possibly on another device.
 */
export const digestRequest = (
  ctx: AppContext,
  input: GenerateDigestInput,
): Result<GenerationRequest<"digest">, AppError> => {
  const state = ctx.store.getState();
  const context = topicContextOf(state.topics, input.topicId);
  if (!context.ok) return err(domainError(context.error));

  const now = ctx.deps.clock.now();
  const all = sourcesOfTopic(state.sources, input.topicId);
  const sources = feedableSources(all);
  const window = periodWindow(input.period, now, input.mode ?? "rolling");

  return ok({
    key: digestTaskKey(input.topicId, input.period),
    kind: "digest",
    input: {
      context: context.value,
      period: input.period,
      window,
      sources,
      blockedHosts: blacklistedHosts(all),
      now,
    },
    meta: {
      topicId: input.topicId,
      period: input.period,
      window,
      sourceIds: sources.map((s) => s.id),
    },
  });
};

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
): Promise<Result<Generation<DigestDraft>, AppError>> => {
  const request = digestRequest(ctx, input);
  if (!request.ok) return request;
  return runGeneration(ctx, request.value);
};
