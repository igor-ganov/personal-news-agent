import type { Instant } from "../time/instant.js";
import type { FocusId, TopicId } from "./ids.js";

/**
 * A focus area — one of the "разделы" a topic can carry. A topic may have several,
 * each narrowing the interest in a different direction.
 */
export interface FocusArea {
  readonly id: FocusId;
  /** Short label, e.g. "Инференс на edge-устройствах". */
  readonly title: string;
  /** Free-form detail: what exactly is interesting here and why. */
  readonly detail: string;
  /** Higher weight = more prominence in digests and lesson planning. 1..5 */
  readonly weight: number;
}

/**
 * A topic, or a sub-topic — the structure is recursive via `parentId`.
 * Root topics have `parentId === null`.
 */
export interface Topic {
  readonly id: TopicId;
  readonly parentId: TopicId | null;
  readonly title: string;
  /** What the user wants out of this topic overall. */
  readonly brief: string;
  readonly focusAreas: readonly FocusArea[];
  /** Explicit anti-interests — kept out of digests and lessons. */
  readonly excludes: readonly string[];
  /** Preferred language of generated material, BCP-47, e.g. "ru". */
  readonly language: string;
  /** How deep the user already is: shapes lecture level. */
  readonly level: TopicLevel;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export const TOPIC_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type TopicLevel = (typeof TOPIC_LEVELS)[number];

/** A topic together with its children — the shape the UI renders. */
export interface TopicNode {
  readonly topic: Topic;
  readonly children: readonly TopicNode[];
}

/**
 * The flattened interest context for a topic: its own fields merged with those
 * inherited from every ancestor. This is what prompts are built from, so a
 * sub-topic automatically carries the framing of its parents.
 */
export interface TopicContext {
  readonly topic: Topic;
  /** Root → … → topic. */
  readonly path: readonly Topic[];
  readonly focusAreas: readonly FocusArea[];
  readonly excludes: readonly string[];
  readonly language: string;
  readonly level: TopicLevel;
}
