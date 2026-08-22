import {
  addFocusArea,
  createTopic,
  descendantIdsOf,
  err,
  moveTopic,
  ok,
  removeFocusArea,
  updateFocusArea,
  updateTopic,
  type FocusDraft,
  type FocusId,
  type Result,
  type Topic,
  type TopicDraft,
  type TopicId,
  type TopicPatch,
} from "@pna/core";
import type { AppContext } from "../container.js";
import { domainError, type AppError } from "../errors.js";

const deps = (ctx: AppContext) => ({ ids: ctx.deps.ids, now: ctx.deps.clock.now() });

export const addTopic = (ctx: AppContext, draft: TopicDraft): Result<Topic, AppError> => {
  const created = createTopic(draft, deps(ctx));
  if (!created.ok) return err(domainError(created.error));
  ctx.store.dispatch({ type: "topics/upsert", topic: created.value });
  return ok(created.value);
};

export const editTopic = (
  ctx: AppContext,
  id: TopicId,
  patch: TopicPatch,
): Result<Topic, AppError> => {
  const topic = ctx.store.getState().topics[id];
  if (!topic) return err(domainError("unknown-topic"));

  const updated = updateTopic(topic, patch, ctx.deps.clock.now());
  if (!updated.ok) return err(domainError(updated.error));
  ctx.store.dispatch({ type: "topics/upsert", topic: updated.value });
  return ok(updated.value);
};

export const reparentTopic = (
  ctx: AppContext,
  id: TopicId,
  parentId: TopicId | null,
): Result<Topic, AppError> => {
  const moved = moveTopic(ctx.store.getState().topics, id, parentId, ctx.deps.clock.now());
  if (!moved.ok) return err(domainError(moved.error));

  const topic = moved.value[id];
  if (!topic) return err(domainError("unknown-topic"));
  ctx.store.dispatch({ type: "topics/upsert", topic });
  return ok(topic);
};

/** Removes a topic together with its whole subtree and everything attached to it. */
export const deleteTopic = (ctx: AppContext, id: TopicId): Result<TopicId[], AppError> => {
  const state = ctx.store.getState();
  if (!state.topics[id]) return err(domainError("unknown-topic"));

  const removed = [id, ...descendantIdsOf(state.topics, id)];
  ctx.store.dispatch({ type: "topics/remove", id });
  return ok(removed);
};

export const addFocus = (
  ctx: AppContext,
  topicId: TopicId,
  draft: FocusDraft,
): Result<Topic, AppError> => {
  const topic = ctx.store.getState().topics[topicId];
  if (!topic) return err(domainError("unknown-topic"));

  const updated = addFocusArea(topic, draft, deps(ctx));
  if (!updated.ok) return err(domainError(updated.error));
  ctx.store.dispatch({ type: "topics/upsert", topic: updated.value });
  return ok(updated.value);
};

export const editFocus = (
  ctx: AppContext,
  topicId: TopicId,
  focus: FocusId,
  patch: Partial<FocusDraft>,
): Result<Topic, AppError> => {
  const topic = ctx.store.getState().topics[topicId];
  if (!topic) return err(domainError("unknown-topic"));

  const updated = updateFocusArea(topic, focus, patch, ctx.deps.clock.now());
  if (!updated.ok) return err(domainError(updated.error));
  ctx.store.dispatch({ type: "topics/upsert", topic: updated.value });
  return ok(updated.value);
};

export const removeFocus = (
  ctx: AppContext,
  topicId: TopicId,
  focus: FocusId,
): Result<Topic, AppError> => {
  const topic = ctx.store.getState().topics[topicId];
  if (!topic) return err(domainError("unknown-topic"));

  const updated = removeFocusArea(topic, focus, ctx.deps.clock.now());
  ctx.store.dispatch({ type: "topics/upsert", topic: updated });
  return ok(updated);
};
