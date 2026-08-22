import { QUESTION_KINDS, type Question, type QuizDraft } from "@pna/core";
import { z } from "zod";

export const questionOptionSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
});

export const questionSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(QUESTION_KINDS),
  prompt: z.string(),
  /** Empty for open questions. */
  options: z.array(questionOptionSchema),
  correct_option_ids: z.array(z.string()),
  /** For open questions: what a good answer must contain. */
  expected_points: z.array(z.string()),
  explanation: z.string(),
});

export const quizSchema = z.strictObject({
  questions: z.array(questionSchema),
});

export type QuizPayload = z.infer<typeof quizSchema>;

/**
 * Repairs what can be repaired and discards what cannot:
 *  - a "single" question with several correct options is really a multi-select;
 *  - a choice question whose correct ids are not among its options is unusable.
 */
const toQuestion = (raw: z.infer<typeof questionSchema>): Question | null => {
  const prompt = raw.prompt.trim();
  if (prompt.length === 0) return null;

  const options = raw.options
    .map((o) => ({ id: o.id.trim(), text: o.text.trim() }))
    .filter((o) => o.id.length > 0 && o.text.length > 0);

  const base = {
    id: raw.id.trim(),
    prompt,
    explanation: raw.explanation.trim(),
    expectedPoints: raw.expected_points.map((p) => p.trim()).filter((p) => p.length > 0),
  };
  if (base.id.length === 0) return null;

  if (raw.kind === "open") {
    return { ...base, kind: "open", options: [], correctOptionIds: [] };
  }

  const optionIds = new Set(options.map((o) => o.id));
  const correct = [...new Set(raw.correct_option_ids.map((id) => id.trim()))].filter((id) =>
    optionIds.has(id),
  );
  if (options.length < 2 || correct.length === 0) return null;
  if (correct.length === options.length) return null;

  return {
    ...base,
    kind: raw.kind === "single" && correct.length > 1 ? "multi" : raw.kind,
    options,
    correctOptionIds: correct,
  };
};

export const toQuizDraft = (payload: QuizPayload): QuizDraft => {
  const questions: Question[] = [];
  const seen = new Set<string>();
  for (const raw of payload.questions) {
    const question = toQuestion(raw);
    if (!question || seen.has(question.id)) continue;
    seen.add(question.id);
    questions.push(question);
  }
  return { questions };
};
