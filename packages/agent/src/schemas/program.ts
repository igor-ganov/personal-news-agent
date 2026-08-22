import type { ProgramDraft } from "@pna/core";
import { z } from "zod";

export const lessonDraftSchema = z.strictObject({
  title: z.string(),
  objective: z.string(),
  estimated_minutes: z.number(),
});

export const moduleDraftSchema = z.strictObject({
  title: z.string(),
  objective: z.string(),
  lessons: z.array(lessonDraftSchema),
});

export const programDraftSchema = z.strictObject({
  title: z.string(),
  goal: z.string(),
  rationale: z.string(),
  modules: z.array(moduleDraftSchema),
});

export type ProgramPayload = z.infer<typeof programDraftSchema>;

const clampMinutes = (raw: number, fallback: number): number => {
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(240, Math.max(10, Math.round(raw)));
};

export const toProgramDraft = (
  payload: ProgramPayload,
  defaultMinutes: number,
): ProgramDraft => ({
  title: payload.title.trim(),
  goal: payload.goal.trim(),
  rationale: payload.rationale.trim(),
  modules: payload.modules
    .map((module) => ({
      title: module.title.trim(),
      objective: module.objective.trim(),
      lessons: module.lessons
        .map((lesson) => ({
          title: lesson.title.trim(),
          objective: lesson.objective.trim(),
          estimatedMinutes: clampMinutes(lesson.estimated_minutes, defaultMinutes),
        }))
        .filter((lesson) => lesson.title.length > 0),
    }))
    .filter((module) => module.title.length > 0),
});
