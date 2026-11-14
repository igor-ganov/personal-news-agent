import type { SuggestInput } from "@pna/agent";
import {
  appendSuggestions,
  childrenOf,
  err,
  ok,
  programsOfTopic,
  SUGGESTION_BATCH,
  topicContextOf,
  type AppState,
  type Result,
  type Suggestion,
  type SuggestionKind,
  type TopicId,
} from "@pna/core";
import type { AppContext } from "../container.js";
import { appError, domainError, type AppError } from "../errors.js";

export interface IdeasRequest {
  readonly kind: SuggestionKind;
  readonly topicId: TopicId;
  /** What the list already shows — kept, and never offered again. */
  readonly shown: readonly Suggestion[];
}

/** What the topic already has of each kind, so it is never suggested back. */
const EXISTING: Readonly<Record<SuggestionKind, (state: AppState, topicId: TopicId) => readonly string[]>> = {
  subtopic: (state, topicId) => childrenOf(state.topics, topicId).map((topic) => topic.title),
  skill: (state, topicId) => programsOfTopic(state, topicId).map((summary) => summary.program.title),
};

const askHere = async (ctx: AppContext, request: SuggestInput) => {
  const answered = await ctx.deps.provider.suggest(request);
  return answered.ok ? answered : err(appError(answered.error.kind, answered.error.message));
};

/**
 * The next batch of ideas for a card, appended to the ones already shown.
 *
 * With a server the call goes there, under the account's key; without one it
 * runs on this device. Either way it is answered while the user waits — a
 * list of names is seconds of work, not a job worth queueing.
 */
export const suggestIdeas = async (
  ctx: AppContext,
  request: IdeasRequest,
): Promise<Result<readonly Suggestion[], AppError>> => {
  const state = ctx.store.getState();
  const context = topicContextOf(state.topics, request.topicId);
  if (!context.ok) return err(domainError(context.error));

  const input: SuggestInput = {
    kind: request.kind,
    context: context.value,
    exclude: [...EXISTING[request.kind](state, request.topicId), ...request.shown.map((idea) => idea.title)],
    count: SUGGESTION_BATCH,
  };

  const answered = ctx.deps.jobs ? await ctx.deps.jobs.suggest(input) : await askHere(ctx, input);
  return answered.ok ? ok(appendSuggestions(request.shown, answered.value)) : answered;
};
