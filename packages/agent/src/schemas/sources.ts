import { SOURCE_KINDS, type SourceCandidate } from "@pna/core";
import { z } from "zod";

export const sourceCandidateSchema = z.strictObject({
  title: z.string(),
  url: z.string(),
  kind: z.enum(SOURCE_KINDS),
  rationale: z.string(),
});

export const discoverSourcesSchema = z.strictObject({
  sources: z.array(sourceCandidateSchema),
});

export type DiscoverSourcesPayload = z.infer<typeof discoverSourcesSchema>;

/** Drops entries the model left half-filled rather than passing them downstream. */
export const toSourceCandidates = (payload: DiscoverSourcesPayload): SourceCandidate[] =>
  payload.sources
    .map((s) => ({
      title: s.title.trim(),
      url: s.url.trim(),
      kind: s.kind,
      rationale: s.rationale.trim(),
    }))
    .filter((s) => s.url.length > 0 && s.title.length > 0);
