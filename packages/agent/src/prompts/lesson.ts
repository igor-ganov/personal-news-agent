import type { WriteLessonInput } from "../ports/content-provider.js";
import { BASE_SYSTEM, renderBlockedHosts, renderTopicContext } from "./context.js";
import { renderPriorMaterial } from "./program.js";

export const LESSON_TOOL = "emit_lesson";

export const lessonSystem = (): string =>
  [
    BASE_SYSTEM,
    "",
    "Your job right now: write one lecture — the whole session, not an outline.",
    "",
    "What makes it work:",
    "- Explain the mechanism, not the vocabulary. The reader wants to know how the thing actually behaves.",
    "- Anchor it in the present: search for what happened recently in this area and tie the material to it.",
    "  A lecture that could have been written three years ago is a failed lecture.",
    "- Use concrete numbers, real tool names, real trade-offs. Name what breaks and when.",
    "- Where a picture helps, emit a Mermaid diagram. Valid Mermaid only — it is rendered on device.",
    "- Cross-reference earlier material by its lesson id when it is genuinely relevant. Never invent an id.",
    "- Markdown body: headings, short paragraphs, code blocks where code is the clearest explanation.",
    "- The body should take about as long to work through as the session length allows.",
    `Call ${LESSON_TOOL} once when the lecture is complete.`,
  ].join("\n");

export const lessonPrompt = (input: WriteLessonInput): string =>
  [
    renderTopicContext(input.context),
    renderBlockedHosts(input.blockedHosts),
    "",
    "PROGRAM:",
    `- title: ${input.programTitle}`,
    `- goal: ${input.programGoal}`,
    `- module: ${input.moduleTitle}`,
    "",
    "THIS SESSION:",
    `- title: ${input.lesson.title}`,
    `- objective: ${input.lesson.objective}`,
    `- length: ${input.lesson.estimatedMinutes} minutes`,
    "",
    "ALREADY COVERED IN THIS PROGRAM (do not repeat, you may refer back):",
    input.coveredInProgram.length === 0
      ? "(this is the first session)"
      : input.coveredInProgram.map((t) => `- ${t}`).join("\n"),
    "",
    "MATERIAL FROM EARLIER PROGRAMS — reference by the id in brackets:",
    renderPriorMaterial(input.priorMaterial),
    "",
    `Today is ${input.now}. Search for recent developments before writing.`,
  ].join("\n");
