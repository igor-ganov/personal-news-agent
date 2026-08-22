import {
  blacklistedHosts,
  err,
  findProgramOfLesson,
  lessonContentOf,
  materialiseProgram,
  ok,
  priorMaterialOf,
  programLessons,
  quizId as toQuizId,
  quizOfLesson,
  recordAttempt,
  rescheduleProgram,
  setLessonStatus,
  sourcesOfTopic,
  topicContextOf,
  type Answers,
  type ContinuationMode,
  type LessonContent,
  type LessonId,
  type PriorMaterial,
  type ProgramDraft,
  type ProgramId,
  type ProgramMap,
  type Quiz,
  type QuizAttempt,
  type Result,
  type Schedule,
  type SkillProgram,
  type TopicId,
} from "@pna/core";
import type { AppContext } from "../container.js";
import { domainError, type AppError } from "../errors.js";

export const lessonTaskKey = (id: LessonId): string => `lesson:${id}`;
export const quizTaskKey = (id: LessonId): string => `quiz:${id}`;
export const programTaskKey = (id: TopicId): string => `program:${id}`;

export const DEFAULT_QUESTION_COUNT = 6;

/**
 * Everything a program built on `basedOn` may reference: each base's own
 * lessons plus everything its own foundations covered, in study order.
 * Bases that share an ancestor contribute it once.
 */
const priorMaterialForBases = (
  programs: ProgramMap,
  basedOn: readonly ProgramId[],
): PriorMaterial[] => {
  const seen = new Set<string>();
  const out: PriorMaterial[] = [];

  for (const id of basedOn) {
    const base = programs[id];
    if (!base) continue;

    const ownMaterial: PriorMaterial[] = programLessons(base).map((lesson) => ({
      programId: base.id,
      programTitle: base.title,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      objective: lesson.objective,
      covered: lesson.status === "done",
    }));

    for (const material of [...priorMaterialOf(programs, id), ...ownMaterial]) {
      if (seen.has(material.lessonId)) continue;
      seen.add(material.lessonId);
      out.push(material);
    }
  }

  return out;
};

export interface DraftProgramInputs {
  readonly topicId: TopicId;
  readonly intent: string;
  readonly schedule: Schedule;
  readonly basedOn: readonly ProgramId[];
  readonly continuation: ContinuationMode;
}

/**
 * Produces a plan for the user to edit. Nothing is stored yet — the draft only
 * becomes a program once `commitProgram` is called, which is what makes
 * "модернизировать на момент создания" possible.
 */
export const draftProgram = async (
  ctx: AppContext,
  input: DraftProgramInputs,
): Promise<Result<ProgramDraft, AppError>> => {
  const state = ctx.store.getState();
  const context = topicContextOf(state.topics, input.topicId);
  if (!context.ok) return err(domainError(context.error));

  const drafted = await ctx.deps.provider.draftProgram({
    context: context.value,
    intent: input.intent,
    weeks: input.schedule.intensity.weeks,
    sessionsPerWeek: input.schedule.intensity.sessionsPerWeek,
    minutesPerSession: input.schedule.intensity.minutesPerSession,
    priorMaterial: priorMaterialForBases(state.programs, input.basedOn),
    continuation: input.continuation,
    now: ctx.deps.clock.now(),
  });
  if (!drafted.ok) return err(drafted.error);
  return ok(drafted.value);
};

export interface CommitProgramInput {
  readonly topicId: TopicId;
  readonly draft: ProgramDraft;
  readonly schedule: Schedule;
  readonly basedOn: readonly ProgramId[];
  readonly continuation: ContinuationMode;
}

/** Turns the edited plan into a stored program with dated sessions. */
export const commitProgram = (
  ctx: AppContext,
  input: CommitProgramInput,
): Result<SkillProgram, AppError> => {
  const state = ctx.store.getState();
  if (!state.topics[input.topicId]) return err(domainError("unknown-topic"));

  const materialised = materialiseProgram({
    draft: input.draft,
    topicId: input.topicId,
    schedule: input.schedule,
    basedOn: input.basedOn,
    continuation: input.continuation,
    ids: ctx.deps.ids,
    now: ctx.deps.clock.now(),
  });
  if (!materialised.ok) return err(domainError(materialised.error));

  ctx.store.dispatch({ type: "programs/upsert", program: materialised.value });
  return ok(materialised.value);
};

export const changeSchedule = (
  ctx: AppContext,
  id: ProgramId,
  schedule: Schedule,
): Result<SkillProgram, AppError> => {
  const program = ctx.store.getState().programs[id];
  if (!program) return err(domainError("unknown-program"));

  const rescheduled = rescheduleProgram(program, schedule, ctx.deps.clock.now());
  if (!rescheduled.ok) return err(domainError(rescheduled.error));

  ctx.store.dispatch({ type: "programs/upsert", program: rescheduled.value });
  return ok(rescheduled.value);
};

export const deleteProgram = (ctx: AppContext, id: ProgramId): Result<ProgramId, AppError> => {
  if (!ctx.store.getState().programs[id]) return err(domainError("unknown-program"));
  ctx.store.dispatch({ type: "programs/remove", id });
  return ok(id);
};

/**
 * Writes the lecture for one session.
 *
 * The provider is told what this program has already covered and what earlier
 * programs contain, so the lecture continues the thread instead of restarting it.
 */
export const generateLesson = async (
  ctx: AppContext,
  lessonId: LessonId,
): Promise<Result<LessonContent, AppError>> => {
  const state = ctx.store.getState();
  const program = findProgramOfLesson(state.programs, lessonId);
  if (!program) return err(domainError("unknown-lesson"));

  const module = program.modules.find((m) => m.lessons.some((l) => l.id === lessonId));
  const lesson = module?.lessons.find((l) => l.id === lessonId);
  if (!module || !lesson) return err(domainError("unknown-lesson"));

  const context = topicContextOf(state.topics, program.topicId);
  if (!context.ok) return err(domainError(context.error));

  const ordered = programLessons(program);
  const coveredInProgram = ordered
    .slice(0, ordered.findIndex((l) => l.id === lessonId))
    .map((l) => l.title);

  const now = ctx.deps.clock.now();
  const written = await ctx.deps.provider.writeLesson({
    context: context.value,
    programTitle: program.title,
    programGoal: program.goal,
    moduleTitle: module.title,
    lesson,
    coveredInProgram,
    priorMaterial: priorMaterialOf(state.programs, program.id),
    blockedHosts: blacklistedHosts(sourcesOfTopic(state.sources, program.topicId)),
    now,
  });
  if (!written.ok) return err(written.error);

  const content: LessonContent = { ...written.value, lessonId, generatedAt: now };
  ctx.store.dispatch({ type: "lessons/content", content });

  const marked = setLessonStatus(program, lessonId, lesson.status === "done" ? "done" : "ready", now);
  if (marked.ok) ctx.store.dispatch({ type: "programs/upsert", program: marked.value });

  return ok(content);
};

/** Builds the self-check for a session. The lecture has to exist first. */
export const generateQuiz = async (
  ctx: AppContext,
  lessonId: LessonId,
): Promise<Result<Quiz, AppError>> => {
  const state = ctx.store.getState();
  const program = findProgramOfLesson(state.programs, lessonId);
  const lesson = program && programLessons(program).find((l) => l.id === lessonId);
  if (!program || !lesson) return err(domainError("unknown-lesson"));

  const content = lessonContentOf(state, lessonId);
  if (!content) return err(domainError("no-lesson-content"));

  const context = topicContextOf(state.topics, program.topicId);
  if (!context.ok) return err(domainError(context.error));

  const built = await ctx.deps.provider.buildQuiz({
    context: context.value,
    lesson,
    lessonBody: content.body,
    keyPoints: content.keyPoints,
    questionCount: DEFAULT_QUESTION_COUNT,
    now: ctx.deps.clock.now(),
  });
  if (!built.ok) return err(built.error);

  const existing = quizOfLesson(state, lessonId);
  const quiz: Quiz = {
    id: existing?.id ?? toQuizId(ctx.deps.ids.next("quiz")),
    lessonId,
    questions: built.value.questions,
  };
  ctx.store.dispatch({ type: "quizzes/upsert", quiz });
  return ok(quiz);
};

/** Grades an attempt and records it. Marking the session done stays the user's call. */
export const submitQuiz = (
  ctx: AppContext,
  lessonId: LessonId,
  answers: Answers,
): Result<QuizAttempt, AppError> => {
  const state = ctx.store.getState();
  const quiz = quizOfLesson(state, lessonId);
  if (!quiz) return err(domainError("unknown-quiz"));

  const attempt = recordAttempt(quiz, answers, ctx.deps.ids, ctx.deps.clock.now());
  ctx.store.dispatch({ type: "attempts/record", attempt });
  return ok(attempt);
};

export const markLesson = (
  ctx: AppContext,
  lessonId: LessonId,
  status: "planned" | "ready" | "done",
): Result<SkillProgram, AppError> => {
  const state = ctx.store.getState();
  const program = findProgramOfLesson(state.programs, lessonId);
  if (!program) return err(domainError("unknown-lesson"));

  const updated = setLessonStatus(program, lessonId, status, ctx.deps.clock.now());
  if (!updated.ok) return err(domainError(updated.error));

  ctx.store.dispatch({ type: "programs/upsert", program: updated.value });
  return ok(updated.value);
};
