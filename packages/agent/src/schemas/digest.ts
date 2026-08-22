import type { DigestDraft, DigestItem, DigestSection } from "@pna/core";
import { z } from "zod";
import { parseModelInstant } from "./instant.js";

export const digestItemSchema = z.strictObject({
  title: z.string(),
  url: z.string(),
  source_title: z.string(),
  /** ISO date, or "" when the source does not say. */
  published_at: z.string(),
  summary: z.string(),
  relevance: z.string(),
  tags: z.array(z.string()),
});

export const digestSectionSchema = z.strictObject({
  title: z.string(),
  items: z.array(digestItemSchema),
});

export const digestSchema = z.strictObject({
  headline: z.string(),
  summary: z.string(),
  sections: z.array(digestSectionSchema),
});

export type DigestPayload = z.infer<typeof digestSchema>;

const toItem = (raw: z.infer<typeof digestItemSchema>): DigestItem => ({
  title: raw.title.trim(),
  url: raw.url.trim(),
  sourceTitle: raw.source_title.trim(),
  publishedAt: parseModelInstant(raw.published_at),
  summary: raw.summary.trim(),
  relevance: raw.relevance.trim(),
  tags: raw.tags.map((t) => t.trim()).filter((t) => t.length > 0),
});

/** Empty sections are dropped — an empty heading is noise in a digest. */
export const toDigestDraft = (payload: DigestPayload): DigestDraft => {
  const sections: DigestSection[] = payload.sections
    .map((section) => ({
      title: section.title.trim(),
      items: section.items.map(toItem).filter((item) => item.title.length > 0),
    }))
    .filter((section) => section.items.length > 0);

  return {
    headline: payload.headline.trim(),
    summary: payload.summary.trim(),
    sections,
    sourceIds: [],
  };
};
