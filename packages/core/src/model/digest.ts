import type { Instant } from "../time/instant.js";
import type { DigestId, SourceId, TopicId } from "./ids.js";

export const DIGEST_PERIODS = ["day", "week", "month", "year"] as const;
export type DigestPeriod = (typeof DIGEST_PERIODS)[number];

/** Half-open interval `[from, to)`. */
export interface Window {
  readonly from: Instant;
  readonly to: Instant;
}

export interface DigestItem {
  readonly title: string;
  readonly url: string;
  readonly sourceTitle: string;
  readonly publishedAt: Instant | null;
  /** Two or three sentences of substance, not a teaser. */
  readonly summary: string;
  /** Why this matters *for this topic's focus areas*. */
  readonly relevance: string;
  readonly tags: readonly string[];
}

export interface DigestSection {
  readonly title: string;
  readonly items: readonly DigestItem[];
}

export interface Digest {
  readonly id: DigestId;
  readonly topicId: TopicId;
  readonly period: DigestPeriod;
  readonly window: Window;
  readonly generatedAt: Instant;
  readonly headline: string;
  /** The "выжимка" itself — what actually changed in the window. */
  readonly summary: string;
  readonly sections: readonly DigestSection[];
  readonly sourceIds: readonly SourceId[];
}

/** A digest as returned by a content provider, before it gets an id. */
export type DigestDraft = Omit<Digest, "id" | "topicId" | "period" | "window" | "generatedAt">;
