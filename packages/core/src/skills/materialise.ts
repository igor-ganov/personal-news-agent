import { err, ok, type Result } from "../fp/result.js";
import type { IdFactory, LessonId, ModuleId, ProgramId, TopicId } from "../model/ids.js";
import type {
  ContinuationMode,
  LessonPlan,
  ProgramDraft,
  ProgramModule,
  Schedule,
  SkillProgram,
} from "../model/skill.js";
import { addDays, calendarDayOf, dayStart, type CalendarDay, type Instant } from "../time/instant.js";
import { validateIntensity, weeklyDayOffsets, type IntensityError } from "./intensity.js";

export type MaterialiseError = IntensityError | "empty-plan";

export interface MaterialiseInput {
  readonly draft: ProgramDraft;
  readonly topicId: TopicId;
  readonly schedule: Schedule;
  readonly basedOn: readonly ProgramId[];
  readonly continuation: ContinuationMode;
  readonly ids: IdFactory;
  readonly now: Instant;
}

/**
 * The calendar day of the n-th study session, counting from the start day.
 * Sessions fill week by week, spread across the days the intensity allows;
 * a plan longer than the committed period simply runs past it rather than
 * silently dropping lessons — `capacityReport` is what warns about that.
 */
export const sessionDay = (
  startDay: CalendarDay,
  sessionsPerWeek: number,
  index: number,
): CalendarDay => {
  const offsets = weeklyDayOffsets(sessionsPerWeek);
  const week = Math.floor(index / sessionsPerWeek);
  const offset = offsets[index % sessionsPerWeek] ?? 0;
  return calendarDayOf(addDays(dayStart(startDay), week * 7 + offset));
};

/** Turns an edited draft into a persistent program: ids assigned, sessions dated. */
export const materialiseProgram = (
  input: MaterialiseInput,
): Result<SkillProgram, MaterialiseError> => {
  const intensity = validateIntensity(input.schedule.intensity);
  if (!intensity.ok) return intensity;

  const lessonCount = input.draft.modules.reduce((n, m) => n + m.lessons.length, 0);
  if (input.draft.modules.length === 0 || lessonCount === 0) return err("empty-plan");

  let sessionIndex = 0;
  const modules: ProgramModule[] = input.draft.modules.map((moduleDraft, moduleOrder) => {
    const id = input.ids.next("module") as ModuleId;
    const lessons: LessonPlan[] = moduleDraft.lessons.map((lessonDraft, order) => {
      const scheduledFor = sessionDay(
        input.schedule.startDay,
        input.schedule.intensity.sessionsPerWeek,
        sessionIndex,
      );
      sessionIndex += 1;
      return {
        id: input.ids.next("lesson") as LessonId,
        moduleId: id,
        order,
        title: lessonDraft.title,
        objective: lessonDraft.objective,
        estimatedMinutes: lessonDraft.estimatedMinutes,
        scheduledFor,
        status: "planned",
      };
    });

    return {
      id,
      order: moduleOrder,
      title: moduleDraft.title,
      objective: moduleDraft.objective,
      lessons,
    };
  });

  return ok({
    id: input.ids.next("program") as ProgramId,
    topicId: input.topicId,
    title: input.draft.title,
    goal: input.draft.goal,
    basedOn: [...input.basedOn],
    continuation: input.continuation,
    schedule: input.schedule,
    modules,
    status: "draft",
    createdAt: input.now,
    updatedAt: input.now,
  });
};

/** Re-dates every session after the schedule changed, keeping ids and content intact. */
export const rescheduleProgram = (
  program: SkillProgram,
  schedule: Schedule,
  now: Instant,
): Result<SkillProgram, MaterialiseError> => {
  const intensity = validateIntensity(schedule.intensity);
  if (!intensity.ok) return intensity;

  let sessionIndex = 0;
  const modules = program.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => {
      const scheduledFor = sessionDay(
        schedule.startDay,
        schedule.intensity.sessionsPerWeek,
        sessionIndex,
      );
      sessionIndex += 1;
      return { ...lesson, scheduledFor };
    }),
  }));

  return ok({ ...program, schedule, modules, updatedAt: now });
};
