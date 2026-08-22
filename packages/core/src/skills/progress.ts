import { err, ok, type Result } from "../fp/result.js";
import type { LessonId } from "../model/ids.js";
import type { LessonPlan, LessonStatus, ProgramStatus, SkillProgram } from "../model/skill.js";
import type { CalendarDay, Instant } from "../time/instant.js";
import type { ProgramMap } from "./lineage.js";

/** Every session of a program, in study order. */
export const programLessons = (program: SkillProgram): LessonPlan[] =>
  [...program.modules]
    .sort((a, b) => a.order - b.order)
    .flatMap((module) => [...module.lessons].sort((a, b) => a.order - b.order));

export const findLesson = (program: SkillProgram, id: LessonId): LessonPlan | undefined =>
  programLessons(program).find((l) => l.id === id);

export const findProgramOfLesson = (
  programs: ProgramMap,
  id: LessonId,
): SkillProgram | undefined => Object.values(programs).find((p) => findLesson(p, id) !== undefined);

export interface Progress {
  readonly total: number;
  readonly done: number;
  readonly ready: number;
  /** 0..1; 0 for an empty program. */
  readonly ratio: number;
}

export const programProgress = (program: SkillProgram): Progress => {
  const lessons = programLessons(program);
  const done = lessons.filter((l) => l.status === "done").length;
  return {
    total: lessons.length,
    done,
    ready: lessons.filter((l) => l.status === "ready").length,
    ratio: lessons.length === 0 ? 0 : done / lessons.length,
  };
};

/** The session to open next: the first one not yet finished. */
export const nextLesson = (program: SkillProgram): LessonPlan | undefined =>
  programLessons(program).find((l) => l.status !== "done");

/** Sessions scheduled on or before `day` that are still unfinished. */
export const dueLessons = (program: SkillProgram, day: CalendarDay): LessonPlan[] =>
  programLessons(program).filter(
    (l) => l.status !== "done" && l.scheduledFor !== null && l.scheduledFor <= day,
  );

export const upcomingLessons = (
  program: SkillProgram,
  day: CalendarDay,
  limit = 3,
): LessonPlan[] =>
  programLessons(program)
    .filter((l) => l.status !== "done" && l.scheduledFor !== null && l.scheduledFor > day)
    .slice(0, limit);

export type ProgressError = "unknown-lesson";

/**
 * Records progress on a session. Finishing the last one completes the program,
 * and reopening a session in a completed program makes it active again.
 */
export const setLessonStatus = (
  program: SkillProgram,
  lessonId: LessonId,
  status: LessonStatus,
  now: Instant,
): Result<SkillProgram, ProgressError> => {
  if (!findLesson(program, lessonId)) return err("unknown-lesson");

  const modules = program.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((l) => (l.id === lessonId ? { ...l, status } : l)),
  }));

  const updated: SkillProgram = { ...program, modules, updatedAt: now };
  return ok({ ...updated, status: derivedStatus(updated) });
};

const derivedStatus = (program: SkillProgram): ProgramStatus => {
  if (program.status === "archived") return "archived";
  const { total, done } = programProgress(program);
  if (total > 0 && done === total) return "completed";
  if (done > 0) return "active";
  return program.status === "completed" ? "active" : program.status;
};
