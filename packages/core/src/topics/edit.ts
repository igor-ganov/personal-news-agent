import { err, ok, type Result } from "../fp/result.js";
import { focusId, type FocusId, type IdFactory, type TopicId } from "../model/ids.js";
import type { FocusArea, Topic, TopicLevel } from "../model/topic.js";
import type { Instant } from "../time/instant.js";
import { isDescendantOf, type TopicMap } from "./tree.js";

export interface FocusDraft {
  readonly title: string;
  readonly detail: string;
  readonly weight?: number;
}

export interface TopicDraft {
  readonly parentId: TopicId | null;
  readonly title: string;
  readonly brief?: string;
  readonly focusAreas?: readonly FocusDraft[];
  readonly excludes?: readonly string[];
  readonly language?: string;
  readonly level?: TopicLevel;
}

export interface EditDeps {
  readonly ids: IdFactory;
  readonly now: Instant;
}

export type TopicError = "empty-title" | "unknown-topic" | "cycle" | "unknown-focus";

const clampWeight = (weight: number | undefined): number =>
  Math.min(5, Math.max(1, Math.round(weight ?? 3)));

const trimmedNonEmpty = (values: readonly string[] | undefined): string[] =>
  (values ?? []).map((v) => v.trim()).filter((v) => v.length > 0);

export const toFocusArea = (draft: FocusDraft, id: FocusId): FocusArea => ({
  id,
  title: draft.title.trim(),
  detail: draft.detail.trim(),
  weight: clampWeight(draft.weight),
});

export const createTopic = (draft: TopicDraft, deps: EditDeps): Result<Topic, TopicError> => {
  const title = draft.title.trim();
  if (title.length === 0) return err("empty-title");

  return ok({
    id: deps.ids.next("topic") as TopicId,
    parentId: draft.parentId,
    title,
    brief: (draft.brief ?? "").trim(),
    focusAreas: (draft.focusAreas ?? []).map((f) =>
      toFocusArea(f, focusId(deps.ids.next("focus"))),
    ),
    excludes: trimmedNonEmpty(draft.excludes),
    language: draft.language ?? "ru",
    level: draft.level ?? "intermediate",
    createdAt: deps.now,
    updatedAt: deps.now,
  });
};

export type TopicPatch = Partial<
  Pick<Topic, "title" | "brief" | "excludes" | "language" | "level">
>;

export const updateTopic = (
  topic: Topic,
  patch: TopicPatch,
  now: Instant,
): Result<Topic, TopicError> => {
  const title = patch.title === undefined ? topic.title : patch.title.trim();
  if (title.length === 0) return err("empty-title");

  return ok({
    ...topic,
    title,
    brief: patch.brief === undefined ? topic.brief : patch.brief.trim(),
    excludes: patch.excludes === undefined ? topic.excludes : trimmedNonEmpty(patch.excludes),
    language: patch.language ?? topic.language,
    level: patch.level ?? topic.level,
    updatedAt: now,
  });
};

/** Re-parents a topic. Refuses to create a cycle or to detach into nowhere. */
export const moveTopic = (
  topics: TopicMap,
  id: TopicId,
  newParentId: TopicId | null,
  now: Instant,
): Result<TopicMap, TopicError> => {
  const topic = topics[id];
  if (!topic) return err("unknown-topic");
  if (newParentId !== null && !topics[newParentId]) return err("unknown-topic");
  if (newParentId === id) return err("cycle");
  if (newParentId !== null && isDescendantOf(topics, newParentId, id)) return err("cycle");

  return ok({ ...topics, [id]: { ...topic, parentId: newParentId, updatedAt: now } });
};

/** Removes a topic and every topic beneath it. */
export const removeTopicSubtree = (topics: TopicMap, id: TopicId, removeIds: readonly TopicId[]): TopicMap => {
  const doomed = new Set<TopicId>([id, ...removeIds]);
  return Object.fromEntries(
    Object.entries(topics).filter(([key]) => !doomed.has(key as TopicId)),
  ) as TopicMap;
};

/* ----------------------------------------------------------- focus areas -- */

export const addFocusArea = (
  topic: Topic,
  draft: FocusDraft,
  deps: EditDeps,
): Result<Topic, TopicError> => {
  const title = draft.title.trim();
  if (title.length === 0) return err("empty-title");
  const area = toFocusArea(draft, focusId(deps.ids.next("focus")));
  return ok({ ...topic, focusAreas: [...topic.focusAreas, area], updatedAt: deps.now });
};

export const updateFocusArea = (
  topic: Topic,
  id: FocusId,
  patch: Partial<FocusDraft>,
  now: Instant,
): Result<Topic, TopicError> => {
  const existing = topic.focusAreas.find((f) => f.id === id);
  if (!existing) return err("unknown-focus");
  const title = patch.title === undefined ? existing.title : patch.title.trim();
  if (title.length === 0) return err("empty-title");

  const updated: FocusArea = {
    ...existing,
    title,
    detail: patch.detail === undefined ? existing.detail : patch.detail.trim(),
    weight: patch.weight === undefined ? existing.weight : clampWeight(patch.weight),
  };
  return ok({
    ...topic,
    focusAreas: topic.focusAreas.map((f) => (f.id === id ? updated : f)),
    updatedAt: now,
  });
};

export const removeFocusArea = (topic: Topic, id: FocusId, now: Instant): Topic => ({
  ...topic,
  focusAreas: topic.focusAreas.filter((f) => f.id !== id),
  updatedAt: now,
});
