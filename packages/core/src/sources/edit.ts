import { err, ok, type Result } from "../fp/result.js";
import type { IdFactory, SourceId, TopicId } from "../model/ids.js";
import type { Source, SourceKind, SourceStatus } from "../model/source.js";
import type { Instant } from "../time/instant.js";
import { canonicalSourceUrl, normaliseSourceUrl } from "./url.js";

export type SourceError = "invalid-url" | "duplicate" | "unknown-source";

export interface UserSourceDraft {
  readonly title: string;
  readonly url: string;
  readonly kind?: SourceKind;
  readonly rationale?: string;
}

export interface AddSourceInput {
  readonly existing: readonly Source[];
  readonly draft: UserSourceDraft;
  readonly topicId: TopicId;
  readonly ids: IdFactory;
  readonly now: Instant;
}

/**
 * Adds a source by hand. A user-added source is `origin: "user"`, which protects
 * its title and rationale from being rewritten by later discovery runs.
 * Re-adding a blacklisted URL is treated as un-blacklisting it — the user is
 * explicitly asking for it back.
 */
export const addUserSource = (input: AddSourceInput): Result<Source, SourceError> => {
  const normalised = normaliseSourceUrl(input.draft.url);
  const canonical = canonicalSourceUrl(input.draft.url);
  if (!normalised.ok || !canonical.ok) return err("invalid-url");

  const existing = input.existing.find((s) => s.key === normalised.value);
  if (existing && existing.status !== "blacklisted") return err("duplicate");

  const title = input.draft.title.trim() || canonical.value;

  if (existing) {
    return ok({
      ...existing,
      title,
      url: canonical.value,
      kind: input.draft.kind ?? existing.kind,
      origin: "user",
      status: "active",
      rationale: (input.draft.rationale ?? "").trim() || existing.rationale,
      lastConfirmedAt: input.now,
    });
  }

  return ok({
    id: input.ids.next("source") as SourceId,
    topicId: input.topicId,
    title,
    url: canonical.value,
    key: normalised.value,
    kind: input.draft.kind ?? "site",
    origin: "user",
    status: "active",
    rationale: (input.draft.rationale ?? "").trim(),
    addedAt: input.now,
    lastConfirmedAt: input.now,
  });
};

export const setSourceStatus = (source: Source, status: SourceStatus): Source =>
  source.status === status ? source : { ...source, status };

/** Editing a source by hand takes ownership of it, so discovery stops rewriting it. */
export const editSource = (
  source: Source,
  patch: Partial<Pick<Source, "title" | "kind" | "rationale">>,
): Source => ({
  ...source,
  title: patch.title === undefined ? source.title : patch.title.trim() || source.title,
  kind: patch.kind ?? source.kind,
  rationale: patch.rationale === undefined ? source.rationale : patch.rationale.trim(),
  origin: "user",
});
