import type { BuildQuizInput } from "../ports/content-provider.js";
import { BASE_SYSTEM, renderTopicContext } from "./context.js";

export const QUIZ_TOOL = "emit_quiz";

export const quizSystem = (): string =>
  [
    BASE_SYSTEM,
    "",
    "Your job right now: write a self-check for the lecture below.",
    "",
    "Rules:",
    "- Test understanding, not recall of wording. A question answerable by pattern-matching the text is a bad question.",
    "- Every choice question needs 3-5 options and at least one option that is wrong for an interesting reason.",
    "- Never make every option correct.",
    "- Mark a question 'multi' when more than one option is right; 'single' otherwise.",
    "- Include one or two 'open' questions where the user has to explain something; list what a good answer must contain.",
    "- Every question needs an explanation the user reads after answering — it should teach, not just confirm.",
    "- Give each question a short unique id like q1, q2, and option ids like a, b, c.",
    `Call ${QUIZ_TOOL} once with the questions.`,
  ].join("\n");

export const quizPrompt = (input: BuildQuizInput): string =>
  [
    renderTopicContext(input.context),
    "",
    "SESSION:",
    `- title: ${input.lesson.title}`,
    `- objective: ${input.lesson.objective}`,
    "",
    "KEY POINTS:",
    input.keyPoints.length === 0 ? "(none given)" : input.keyPoints.map((p) => `- ${p}`).join("\n"),
    "",
    `Write ${input.questionCount} questions covering the lecture below.`,
    "",
    "LECTURE:",
    input.lessonBody,
  ].join("\n");
