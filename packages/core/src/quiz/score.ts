import type { AttemptId, IdFactory } from "../model/ids.js";
import type {
  Answers,
  Question,
  QuestionResult,
  QuestionVerdict,
  Quiz,
  QuizAttempt,
  QuizResult,
} from "../model/quiz.js";
import type { Instant } from "../time/instant.js";

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

const verdictOf = (question: Question, answers: Answers): QuestionVerdict => {
  if (question.kind === "open") {
    const text = (answers.texts[question.id] ?? "").trim();
    return text.length === 0 ? "unanswered" : "self-review";
  }

  const selected = answers.choices[question.id] ?? [];
  if (selected.length === 0) return "unanswered";
  return sameSet(selected, question.correctOptionIds) ? "correct" : "incorrect";
};

/**
 * Grades a self-check. Choice questions are graded exactly — a partially
 * correct multi-select is wrong, which is the point of a self-check.
 * Open questions cannot be graded automatically and are handed back for
 * self-review rather than silently counted as either right or wrong.
 */
export const scoreQuiz = (quiz: Quiz, answers: Answers): QuizResult => {
  const results: QuestionResult[] = quiz.questions.map((question) => ({
    questionId: question.id,
    verdict: verdictOf(question, answers),
    explanation: question.explanation,
    correctOptionIds: question.correctOptionIds,
  }));

  const graded = results.filter((r) => r.verdict === "correct" || r.verdict === "incorrect");
  const autoGradable = quiz.questions.filter((q) => q.kind !== "open").length;
  const correctCount = graded.filter((r) => r.verdict === "correct").length;

  return {
    quizId: quiz.id,
    results,
    gradedCount: autoGradable,
    correctCount,
    score: autoGradable === 0 ? 0 : correctCount / autoGradable,
    selfReviewIds: results.filter((r) => r.verdict === "self-review").map((r) => r.questionId),
  };
};

export const recordAttempt = (
  quiz: Quiz,
  answers: Answers,
  ids: IdFactory,
  now: Instant,
): QuizAttempt => ({
  id: ids.next("attempt") as AttemptId,
  quizId: quiz.id,
  submittedAt: now,
  answers,
  result: scoreQuiz(quiz, answers),
});

export const MASTERY_THRESHOLD = 0.8;

/** Whether the session can be considered understood well enough to move on. */
export const isMastered = (result: QuizResult): boolean =>
  result.gradedCount > 0 && result.score >= MASTERY_THRESHOLD;
