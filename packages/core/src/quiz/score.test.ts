import { describe, expect, it } from "vitest";
import { sequentialIds } from "../model/ids.js";
import { emptyAnswers, type Answers } from "../model/quiz.js";
import { makeQuestion, makeQuiz, T0 } from "../testing/builders.js";
import { isMastered, recordAttempt, scoreQuiz } from "./score.js";

const answers = (over: Partial<Answers> = {}): Answers => ({ ...emptyAnswers(), ...over });

const quiz = makeQuiz({
  questions: [
    makeQuestion({ id: "q1", kind: "single", correctOptionIds: ["a"] }),
    makeQuestion({
      id: "q2",
      kind: "multi",
      options: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
        { id: "c", text: "C" },
      ],
      correctOptionIds: ["a", "c"],
    }),
    makeQuestion({
      id: "q3",
      kind: "open",
      options: [],
      correctOptionIds: [],
      expectedPoints: ["Упомянуть KV-cache"],
    }),
  ],
});

describe("scoreQuiz", () => {
  it("marks a correct single choice", () => {
    const result = scoreQuiz(quiz, answers({ choices: { q1: ["a"] } }));
    expect(result.results[0]).toMatchObject({ questionId: "q1", verdict: "correct" });
  });

  it("marks a wrong single choice and hands back the explanation", () => {
    const result = scoreQuiz(quiz, answers({ choices: { q1: ["b"] } }));
    expect(result.results[0]).toMatchObject({
      verdict: "incorrect",
      explanation: "Потому что А",
      correctOptionIds: ["a"],
    });
  });

  it("requires an exact match on a multi-select", () => {
    expect(scoreQuiz(quiz, answers({ choices: { q2: ["a", "c"] } })).results[1]!.verdict).toBe(
      "correct",
    );
    expect(scoreQuiz(quiz, answers({ choices: { q2: ["c", "a"] } })).results[1]!.verdict).toBe(
      "correct",
    );
    expect(scoreQuiz(quiz, answers({ choices: { q2: ["a"] } })).results[1]!.verdict).toBe(
      "incorrect",
    );
    expect(scoreQuiz(quiz, answers({ choices: { q2: ["a", "b", "c"] } })).results[1]!.verdict).toBe(
      "incorrect",
    );
  });

  it("treats a missing answer as unanswered, not wrong", () => {
    const result = scoreQuiz(quiz, emptyAnswers());
    expect(result.results.map((r) => r.verdict)).toEqual([
      "unanswered",
      "unanswered",
      "unanswered",
    ]);
  });

  it("sends open questions to self-review when something was written", () => {
    const result = scoreQuiz(quiz, answers({ texts: { q3: "KV-cache растёт линейно" } }));
    expect(result.results[2]!.verdict).toBe("self-review");
    expect(result.selfReviewIds).toEqual(["q3"]);
  });

  it("does not count blank open answers as self-review", () => {
    const result = scoreQuiz(quiz, answers({ texts: { q3: "   " } }));
    expect(result.results[2]!.verdict).toBe("unanswered");
    expect(result.selfReviewIds).toEqual([]);
  });

  it("scores over auto-gradable questions only", () => {
    const result = scoreQuiz(
      quiz,
      answers({ choices: { q1: ["a"], q2: ["a"] }, texts: { q3: "что-то" } }),
    );
    expect(result).toMatchObject({ gradedCount: 2, correctCount: 1, score: 0.5 });
  });

  it("scores zero when nothing is auto-gradable", () => {
    const openOnly = makeQuiz({ questions: [makeQuestion({ id: "q3", kind: "open", options: [], correctOptionIds: [] })] });
    expect(scoreQuiz(openOnly, answers({ texts: { q3: "ответ" } }))).toMatchObject({
      gradedCount: 0,
      score: 0,
    });
  });
});

describe("recordAttempt", () => {
  it("stamps an attempt with its score", () => {
    const attempt = recordAttempt(
      quiz,
      answers({ choices: { q1: ["a"], q2: ["a", "c"] } }),
      sequentialIds(),
      T0,
    );
    expect(attempt).toMatchObject({ id: "attempt_1", quizId: "quiz_1", submittedAt: T0 });
    expect(attempt.result.score).toBe(1);
  });
});

describe("isMastered", () => {
  it("needs at least 80% of the graded questions", () => {
    expect(isMastered(scoreQuiz(quiz, answers({ choices: { q1: ["a"], q2: ["a", "c"] } })))).toBe(true);
    expect(isMastered(scoreQuiz(quiz, answers({ choices: { q1: ["a"], q2: ["b"] } })))).toBe(false);
  });

  it("is never mastered when nothing could be graded", () => {
    const openOnly = makeQuiz({ questions: [makeQuestion({ id: "q", kind: "open", options: [], correctOptionIds: [] })] });
    expect(isMastered(scoreQuiz(openOnly, answers({ texts: { q: "ответ" } })))).toBe(false);
  });
});
