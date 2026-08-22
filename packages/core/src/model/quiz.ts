import type { Instant } from "../time/instant.js";
import type { AttemptId, LessonId, QuizId } from "./ids.js";

export const QUESTION_KINDS = ["single", "multi", "open"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface QuestionOption {
  readonly id: string;
  readonly text: string;
}

export interface Question {
  readonly id: string;
  readonly kind: QuestionKind;
  readonly prompt: string;
  /** Empty for `open` questions. */
  readonly options: readonly QuestionOption[];
  /** Empty for `open` questions. */
  readonly correctOptionIds: readonly string[];
  /** For `open` questions: the points an answer must hit. */
  readonly expectedPoints: readonly string[];
  readonly explanation: string;
}

export interface Quiz {
  readonly id: QuizId;
  readonly lessonId: LessonId;
  readonly questions: readonly Question[];
}

export type QuizDraft = Omit<Quiz, "id" | "lessonId">;

/** `questionId -> selected option ids` for choice questions, or free text for open ones. */
export interface Answers {
  readonly choices: Readonly<Record<string, readonly string[]>>;
  readonly texts: Readonly<Record<string, string>>;
}

export const emptyAnswers = (): Answers => ({ choices: {}, texts: {} });

export const QUESTION_VERDICTS = ["correct", "incorrect", "unanswered", "self-review"] as const;
export type QuestionVerdict = (typeof QUESTION_VERDICTS)[number];

export interface QuestionResult {
  readonly questionId: string;
  readonly verdict: QuestionVerdict;
  readonly explanation: string;
  readonly correctOptionIds: readonly string[];
}

export interface QuizResult {
  readonly quizId: QuizId;
  readonly results: readonly QuestionResult[];
  /** Auto-graded questions only. */
  readonly gradedCount: number;
  readonly correctCount: number;
  /** 0..1 over the auto-graded questions; 0 when nothing was auto-gradable. */
  readonly score: number;
  /** Open questions the user has to judge themselves. */
  readonly selfReviewIds: readonly string[];
}

export interface QuizAttempt {
  readonly id: AttemptId;
  readonly quizId: QuizId;
  readonly submittedAt: Instant;
  readonly answers: Answers;
  readonly result: QuizResult;
}
