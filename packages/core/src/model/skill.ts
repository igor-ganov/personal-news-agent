import type { CalendarDay, Instant } from "../time/instant.js";
import type { LessonId, ModuleId, ProgramId, TopicId } from "./ids.js";

/**
 * How a program relates to the programs it is built on.
 * `fresh` — standalone. The rest all reference prior material, but differently:
 * `deepen` goes further down the same track, `extend` widens to adjacent ground,
 * `apply` turns already-learned theory into practice.
 */
export const CONTINUATION_MODES = ["fresh", "deepen", "extend", "apply"] as const;
export type ContinuationMode = (typeof CONTINUATION_MODES)[number];

export const PROGRAM_STATUSES = ["draft", "active", "completed", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

/** The time budget the user commits to — "на период с заданной интенсивностью". */
export interface Intensity {
  readonly weeks: number;
  readonly sessionsPerWeek: number;
  readonly minutesPerSession: number;
}

export interface Schedule {
  readonly startDay: CalendarDay;
  readonly intensity: Intensity;
}

/** One study session. Content is generated lazily and stored separately. */
export interface LessonPlan {
  readonly id: LessonId;
  readonly moduleId: ModuleId;
  readonly order: number;
  readonly title: string;
  readonly objective: string;
  readonly estimatedMinutes: number;
  readonly scheduledFor: CalendarDay | null;
  readonly status: LessonStatus;
}

export const LESSON_STATUSES = ["planned", "ready", "done"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export interface ProgramModule {
  readonly id: ModuleId;
  readonly order: number;
  readonly title: string;
  readonly objective: string;
  readonly lessons: readonly LessonPlan[];
}

export interface SkillProgram {
  readonly id: ProgramId;
  readonly topicId: TopicId;
  readonly title: string;
  readonly goal: string;
  /** Programs this one continues. Empty for a `fresh` program. */
  readonly basedOn: readonly ProgramId[];
  readonly continuation: ContinuationMode;
  readonly schedule: Schedule;
  readonly modules: readonly ProgramModule[];
  readonly status: ProgramStatus;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

/* ---------------------------------------------------------------- drafts -- */

/** A module as proposed by a content provider — no ids, no dates yet. */
export interface ModuleDraft {
  readonly title: string;
  readonly objective: string;
  readonly lessons: readonly LessonDraft[];
}

export interface LessonDraft {
  readonly title: string;
  readonly objective: string;
  readonly estimatedMinutes: number;
}

/** The editable plan the user tweaks before committing ("модернизировать на момент создания"). */
export interface ProgramDraft {
  readonly title: string;
  readonly goal: string;
  readonly rationale: string;
  readonly modules: readonly ModuleDraft[];
}

/* --------------------------------------------------------------- content -- */

export interface Diagram {
  readonly title: string;
  /** Mermaid source — rendered client-side, no image download. */
  readonly mermaid: string;
  readonly caption: string;
}

export interface ResourceLink {
  readonly title: string;
  readonly url: string;
  readonly kind: "doc" | "article" | "video" | "paper" | "repo" | "course" | "other";
  /** What the user should get out of it. */
  readonly why: string;
}

/** A tie-in to something that actually happened recently in the field. */
export interface NewsHook {
  readonly headline: string;
  readonly url: string;
  readonly publishedAt: Instant | null;
  readonly relevance: string;
}

/** A pointer back into an earlier program's material. */
export interface PriorReference {
  readonly programId: ProgramId;
  readonly lessonId: LessonId | null;
  readonly title: string;
  readonly note: string;
}

export interface LessonContent {
  readonly lessonId: LessonId;
  readonly generatedAt: Instant;
  readonly keyPoints: readonly string[];
  /** Markdown body of the lecture. */
  readonly body: string;
  readonly diagrams: readonly Diagram[];
  readonly links: readonly ResourceLink[];
  readonly newsHooks: readonly NewsHook[];
  readonly priorReferences: readonly PriorReference[];
}

export type LessonContentDraft = Omit<LessonContent, "lessonId" | "generatedAt">;
