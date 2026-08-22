import type { Instant } from "../time/instant.js";
import type { SourceId, TopicId } from "./ids.js";

export const SOURCE_KINDS = [
  "rss",
  "site",
  "blog",
  "youtube",
  "podcast",
  "forum",
  "paper",
  "release-notes",
  "newsletter",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * Who put the source in the list. `user` sources are never rewritten by
 * auto-discovery; `discovered` ones are refreshed on every discovery run.
 */
export const SOURCE_ORIGINS = ["user", "discovered"] as const;
export type SourceOrigin = (typeof SOURCE_ORIGINS)[number];

/**
 * `blacklisted` is sticky: a blacklisted source is never re-added by discovery,
 * which is the whole point of the blacklist.
 */
export const SOURCE_STATUSES = ["active", "muted", "blacklisted"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export interface Source {
  readonly id: SourceId;
  readonly topicId: TopicId;
  readonly title: string;
  readonly url: string;
  /** Normalised form of `url`; the identity used for de-duplication. */
  readonly key: string;
  readonly kind: SourceKind;
  readonly origin: SourceOrigin;
  readonly status: SourceStatus;
  /** Why the source matches the topic — filled in by discovery, editable. */
  readonly rationale: string;
  readonly addedAt: Instant;
  /** Last time discovery saw this source proposed again. */
  readonly lastConfirmedAt: Instant | null;
}

/** A source as proposed by a content provider, before it is admitted to the list. */
export interface SourceCandidate {
  readonly title: string;
  readonly url: string;
  readonly kind: SourceKind;
  readonly rationale: string;
}
