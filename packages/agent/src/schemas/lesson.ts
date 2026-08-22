import type { LessonContentDraft, LessonId, PriorMaterial, ProgramId } from "@pna/core";
import { z } from "zod";
import { parseModelInstant } from "./instant.js";

const RESOURCE_KINDS = ["doc", "article", "video", "paper", "repo", "course", "other"] as const;

export const diagramSchema = z.strictObject({
  title: z.string(),
  /** Mermaid source — rendered on device, so no images are downloaded. */
  mermaid: z.string(),
  caption: z.string(),
});

export const resourceLinkSchema = z.strictObject({
  title: z.string(),
  url: z.string(),
  kind: z.enum(RESOURCE_KINDS),
  why: z.string(),
});

export const newsHookSchema = z.strictObject({
  headline: z.string(),
  url: z.string(),
  published_at: z.string(),
  relevance: z.string(),
});

export const priorReferenceSchema = z.strictObject({
  lesson_id: z.string(),
  title: z.string(),
  note: z.string(),
});

export const lessonContentSchema = z.strictObject({
  key_points: z.array(z.string()),
  body: z.string(),
  diagrams: z.array(diagramSchema),
  links: z.array(resourceLinkSchema),
  news_hooks: z.array(newsHookSchema),
  prior_references: z.array(priorReferenceSchema),
});

export type LessonContentPayload = z.infer<typeof lessonContentSchema>;

/**
 * Cross-references are only kept when they point at material that actually
 * exists upstream — a lecture must not invent a lesson the user never had.
 */
export const toLessonContentDraft = (
  payload: LessonContentPayload,
  priorMaterial: readonly PriorMaterial[],
): LessonContentDraft => {
  const byLessonId = new Map<string, PriorMaterial>(
    priorMaterial.map((m) => [m.lessonId as string, m]),
  );

  return {
    keyPoints: payload.key_points.map((p) => p.trim()).filter((p) => p.length > 0),
    body: payload.body.trim(),
    diagrams: payload.diagrams
      .map((d) => ({ title: d.title.trim(), mermaid: d.mermaid.trim(), caption: d.caption.trim() }))
      .filter((d) => d.mermaid.length > 0),
    links: payload.links
      .map((l) => ({ title: l.title.trim(), url: l.url.trim(), kind: l.kind, why: l.why.trim() }))
      .filter((l) => l.url.length > 0),
    newsHooks: payload.news_hooks
      .map((n) => ({
        headline: n.headline.trim(),
        url: n.url.trim(),
        publishedAt: parseModelInstant(n.published_at),
        relevance: n.relevance.trim(),
      }))
      .filter((n) => n.headline.length > 0),
    priorReferences: payload.prior_references.flatMap((ref) => {
      const material = byLessonId.get(ref.lesson_id.trim());
      if (!material) return [];
      return [
        {
          programId: material.programId as ProgramId,
          lessonId: material.lessonId as LessonId,
          title: ref.title.trim() || material.lessonTitle,
          note: ref.note.trim(),
        },
      ];
    }),
  };
};
