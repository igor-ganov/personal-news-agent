import { DIGEST_PERIODS, type Digest, type DigestPeriod } from "../model/digest.js";
import type { LessonId, ProgramId, TopicId } from "../model/ids.js";
import type { Quiz, QuizAttempt } from "../model/quiz.js";
import type { LessonContent, SkillProgram } from "../model/skill.js";
import type { Source } from "../model/source.js";
import type { AppState } from "../model/state.js";
import type { TopicContext } from "../model/topic.js";
import { latestDigest } from "../digests/select.js";
import { countByStatus, sourcesOfTopic, type SourceCounts } from "../sources/select.js";
import { programProgress, type Progress } from "../skills/progress.js";
import { topicContextOf } from "../topics/context.js";
import { sortBy } from "../fp/array.js";

/** Everything a topic screen needs, assembled in one pass. */
export interface TopicOverview {
  readonly context: TopicContext;
  readonly sources: readonly Source[];
  readonly sourceCounts: SourceCounts;
  readonly digests: Readonly<Partial<Record<DigestPeriod, Digest>>>;
  readonly programs: readonly ProgramSummary[];
}

export interface ProgramSummary {
  readonly program: SkillProgram;
  readonly progress: Progress;
}

export const topicOverview = (state: AppState, topicId: TopicId): TopicOverview | undefined => {
  const context = topicContextOf(state.topics, topicId);
  if (!context.ok) return undefined;

  const sources = sourcesOfTopic(state.sources, topicId);
  const digests = Object.fromEntries(
    DIGEST_PERIODS.map((period) => [period, latestDigest(state.digests, topicId, period)]).filter(
      ([, digest]) => digest !== undefined,
    ),
  ) as Partial<Record<DigestPeriod, Digest>>;

  return {
    context: context.value,
    sources,
    sourceCounts: countByStatus(sources),
    digests,
    programs: programsOfTopic(state, topicId),
  };
};

export const programsOfTopic = (state: AppState, topicId: TopicId): ProgramSummary[] =>
  sortBy(
    Object.values(state.programs).filter((p) => p.topicId === topicId),
    (p) => p.createdAt,
  ).map((program) => ({ program, progress: programProgress(program) }));

export const programById = (state: AppState, id: ProgramId): SkillProgram | undefined =>
  state.programs[id];

export const lessonContentOf = (state: AppState, id: LessonId): LessonContent | undefined =>
  state.lessonContent[id];

export const quizOfLesson = (state: AppState, id: LessonId): Quiz | undefined =>
  Object.values(state.quizzes).find((q) => q.lessonId === id);

/** Attempts for a lesson's quiz, newest first. */
export const attemptsOfLesson = (state: AppState, id: LessonId): QuizAttempt[] => {
  const quiz = quizOfLesson(state, id);
  if (!quiz) return [];
  return sortBy(
    Object.values(state.attempts).filter((a) => a.quizId === quiz.id),
    (a) => a.submittedAt,
  ).reverse();
};

export const bestScoreOfLesson = (state: AppState, id: LessonId): number | undefined => {
  const scores = attemptsOfLesson(state, id).map((a) => a.result.score);
  return scores.length === 0 ? undefined : Math.max(...scores);
};
