import {
  addUserSource,
  blacklistedHosts,
  editSource,
  err,
  mergeDiscoveredSources,
  needsSourceRefresh,
  ok,
  setSourceStatus,
  sourcesOfTopic,
  topicContextOf,
  type MergeOutcome,
  type Result,
  type Source,
  type SourceId,
  type SourceStatus,
  type TopicId,
  type UserSourceDraft,
} from "@pna/core";
import type { AppContext } from "../container.js";
import { domainError, type AppError } from "../errors.js";

export const DISCOVERY_LIMIT = 8;

export const sourceTaskKey = (topicId: TopicId): string => `sources:${topicId}`;

const EMPTY_OUTCOME: MergeOutcome = { sources: [], added: [], refreshed: [], rejected: [] };

export interface RefreshOptions {
  /** Ignore the refresh interval — what the "обновить" button does. */
  readonly force?: boolean;
  readonly limit?: number;
}

/**
 * Asks the provider what else this topic should be following and folds the
 * answer into the existing list.
 *
 * The blacklist is enforced twice on purpose: the hosts go to the provider so
 * it does not waste a search on them, and `mergeDiscoveredSources` drops them
 * again if they come back anyway.
 */
export const refreshTopicSources = async (
  ctx: AppContext,
  topicId: TopicId,
  options: RefreshOptions = {},
): Promise<Result<MergeOutcome, AppError>> => {
  const state = ctx.store.getState();
  const context = topicContextOf(state.topics, topicId);
  if (!context.ok) return err(domainError(context.error));

  const now = ctx.deps.clock.now();
  const existing = sourcesOfTopic(state.sources, topicId);

  if (!options.force && !needsSourceRefresh(existing, now, state.settings.sourceRefreshDays)) {
    return ok(EMPTY_OUTCOME);
  }

  const discovered = await ctx.deps.provider.discoverSources({
    context: context.value,
    known: existing.filter((s) => s.status !== "blacklisted"),
    blockedHosts: blacklistedHosts(existing),
    limit: options.limit ?? DISCOVERY_LIMIT,
    now,
  });
  if (!discovered.ok) return err(discovered.error);

  const outcome = mergeDiscoveredSources({
    existing,
    candidates: discovered.value,
    topicId,
    ids: ctx.deps.ids,
    now,
  });

  if (outcome.added.length > 0 || outcome.refreshed.length > 0) {
    ctx.store.dispatch({
      type: "sources/upsert-many",
      sources: [...outcome.refreshed, ...outcome.added],
    });
  }
  return ok(outcome);
};

/** Runs discovery only if the list has gone stale; used when a topic is opened. */
export const ensureSourcesFresh = async (
  ctx: AppContext,
  topicId: TopicId,
): Promise<Result<MergeOutcome, AppError>> => {
  if (!ctx.store.getState().settings.autoRefreshSources) return ok(EMPTY_OUTCOME);
  return refreshTopicSources(ctx, topicId);
};

export const addSourceByHand = (
  ctx: AppContext,
  topicId: TopicId,
  draft: UserSourceDraft,
): Result<Source, AppError> => {
  const state = ctx.store.getState();
  if (!state.topics[topicId]) return err(domainError("unknown-topic"));

  const added = addUserSource({
    existing: sourcesOfTopic(state.sources, topicId),
    draft,
    topicId,
    ids: ctx.deps.ids,
    now: ctx.deps.clock.now(),
  });
  if (!added.ok) return err(domainError(added.error));

  ctx.store.dispatch({ type: "sources/upsert-many", sources: [added.value] });
  return ok(added.value);
};

export const changeSourceStatus = (
  ctx: AppContext,
  id: SourceId,
  status: SourceStatus,
): Result<Source, AppError> => {
  const source = ctx.store.getState().sources[id];
  if (!source) return err(domainError("unknown-source"));

  const updated = setSourceStatus(source, status);
  ctx.store.dispatch({ type: "sources/upsert-many", sources: [updated] });
  return ok(updated);
};

export const editSourceDetails = (
  ctx: AppContext,
  id: SourceId,
  patch: Partial<Pick<Source, "title" | "kind" | "rationale">>,
): Result<Source, AppError> => {
  const source = ctx.store.getState().sources[id];
  if (!source) return err(domainError("unknown-source"));

  const updated = editSource(source, patch);
  ctx.store.dispatch({ type: "sources/upsert-many", sources: [updated] });
  return ok(updated);
};

/** Forgetting a source entirely. Blacklisting is usually what the user wants instead. */
export const forgetSource = (ctx: AppContext, id: SourceId): Result<SourceId, AppError> => {
  if (!ctx.store.getState().sources[id]) return err(domainError("unknown-source"));
  ctx.store.dispatch({ type: "sources/remove", id });
  return ok(id);
};
