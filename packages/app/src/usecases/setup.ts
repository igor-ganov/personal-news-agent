import type { SetupInput } from "@pna/agent";
import { err, ok, topicContextOf, type Result, type Setup, type SetupKind, type TopicId } from "@pna/core";
import type { AppContext } from "../container.js";
import { appError, domainError, type AppError } from "../errors.js";

export interface SetupRequest {
  readonly kind: SetupKind;
  /** The name as typed: a topic title, or a skill goal. */
  readonly title: string;
  /** The topic the card goes under; none for a new top-level topic. */
  readonly topicId?: TopicId;
}

/** What a new top-level topic is written in until the user says otherwise. */
const DEFAULT_LANGUAGE = "ru";

const inputFor = (ctx: AppContext, request: SetupRequest, title: string): Result<SetupInput, AppError> => {
  if (!request.topicId) return ok({ kind: request.kind, title, language: DEFAULT_LANGUAGE });
  const context = topicContextOf(ctx.store.getState().topics, request.topicId);
  return context.ok
    ? ok({ kind: request.kind, title, language: context.value.language, context: context.value })
    : err(domainError(context.error));
};

const askHere = async (ctx: AppContext, input: SetupInput): Promise<Result<Setup, AppError>> => {
  const answered = await ctx.deps.provider.proposeSetup(input);
  return answered.ok ? answered : err(appError(answered.error.kind, answered.error.message));
};

/**
 * Settings for a card from the name the user typed — called when they leave
 * the name field. With a server the call goes there, under the account's key;
 * without one it runs on this device. Like ideas, it is answered while the
 * user waits.
 */
export const proposeSetup = async (
  ctx: AppContext,
  request: SetupRequest,
): Promise<Result<Setup, AppError>> => {
  const title = request.title.trim();
  if (title.length === 0) return err(domainError("empty-title"));
  const input = inputFor(ctx, request, title);
  if (!input.ok) return input;
  return ctx.deps.jobs ? ctx.deps.jobs.setup(input.value) : askHere(ctx, input.value);
};

/**
 * Wraps an async call so that only the latest one is answered: an earlier call
 * still in flight resolves to `undefined`. The user may leave the name field,
 * type a new name and leave it again before the first answer arrives — that
 * answer is for a name that no longer is on screen.
 */
export const latestOnly = <A extends readonly unknown[], R>(
  call: (...args: A) => Promise<R>,
): ((...args: A) => Promise<R | undefined>) => {
  let latest = 0;
  return async (...args) => {
    const ticket = ++latest;
    const answer = await call(...args);
    return ticket === latest ? answer : undefined;
  };
};
