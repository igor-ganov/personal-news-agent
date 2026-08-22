/** Branded identifiers — structurally distinct so a LessonId cannot stand in for a TopicId. */
type Branded<Tag extends string> = string & { readonly __id: Tag };

export type TopicId = Branded<"Topic">;
export type SourceId = Branded<"Source">;
export type DigestId = Branded<"Digest">;
export type ProgramId = Branded<"Program">;
export type ModuleId = Branded<"Module">;
export type LessonId = Branded<"Lesson">;
export type QuizId = Branded<"Quiz">;
export type AttemptId = Branded<"Attempt">;
export type FocusId = Branded<"Focus">;

/** Injected so every id-producing function stays pure and deterministic in tests. */
export interface IdFactory {
  next(prefix: string): string;
}

/** Deterministic ids, counted per prefix: `topic_1`, `topic_2`, `focus_1`, … */
export const sequentialIds = (start = 1): IdFactory => {
  const counters = new Map<string, number>();
  return {
    next: (prefix) => {
      const n = counters.get(prefix) ?? start;
      counters.set(prefix, n + 1);
      return `${prefix}_${n}`;
    },
  };
};

export const randomIds = (): IdFactory => ({
  next: (prefix) => `${prefix}_${crypto.randomUUID()}`,
});

export const topicId = (raw: string): TopicId => raw as TopicId;
export const sourceId = (raw: string): SourceId => raw as SourceId;
export const digestId = (raw: string): DigestId => raw as DigestId;
export const programId = (raw: string): ProgramId => raw as ProgramId;
export const moduleId = (raw: string): ModuleId => raw as ModuleId;
export const lessonId = (raw: string): LessonId => raw as LessonId;
export const quizId = (raw: string): QuizId => raw as QuizId;
export const attemptId = (raw: string): AttemptId => raw as AttemptId;
export const focusId = (raw: string): FocusId => raw as FocusId;
