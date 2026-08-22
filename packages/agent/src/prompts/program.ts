import type { PriorMaterial } from "@pna/core";
import type { DraftProgramInput } from "../ports/content-provider.js";
import { BASE_SYSTEM, renderTopicContext } from "./context.js";

export const PROGRAM_TOOL = "emit_program";

const CONTINUATION_GUIDANCE: Record<DraftProgramInput["continuation"], string> = {
  fresh: "This is a standalone program. Assume only the level stated in the topic context.",
  deepen:
    "This program CONTINUES the prior programs listed below and goes deeper on the same ground. Do not re-teach what is already covered — reference it and build on top.",
  extend:
    "This program EXTENDS the prior programs listed below into adjacent territory. Assume their material as known background and spend the time on what is new.",
  apply:
    "This program turns the theory from the prior programs listed below into practice. Most sessions should produce something the user builds, measures or ships.",
};

export const renderPriorMaterial = (material: readonly PriorMaterial[]): string => {
  if (material.length === 0) return "(nothing — this is the user's first program on this topic)";
  return material
    .map(
      (m) =>
        `- [${m.lessonId}] "${m.lessonTitle}" (program: ${m.programTitle}) — ${
          m.covered ? "completed" : "planned, not studied yet"
        }`,
    )
    .join("\n");
};

export const programSystem = (continuation: DraftProgramInput["continuation"]): string =>
  [
    BASE_SYSTEM,
    "",
    "Your job right now: design a study program the user can actually finish in the time they committed.",
    CONTINUATION_GUIDANCE[continuation],
    "",
    "Design rules:",
    "- Every session has one objective that can be checked at the end of it.",
    "- Order sessions so each one depends only on earlier ones.",
    "- Group sessions into 2-6 modules, each with a stated outcome.",
    "- Do not pad. Fewer, denser sessions beat a plan that cannot be finished.",
    "- The plan will be shown to the user for editing before anything is generated, so keep titles self-explanatory.",
    `Call ${PROGRAM_TOOL} once with the plan.`,
  ].join("\n");

export const programPrompt = (input: DraftProgramInput): string => {
  const sessions = input.weeks * input.sessionsPerWeek;
  return [
    renderTopicContext(input.context),
    "",
    "WHAT THE USER ASKED FOR:",
    input.intent.trim() || "(no extra detail — use the topic context)",
    "",
    "TIME BUDGET:",
    `- ${input.weeks} weeks, ${input.sessionsPerWeek} sessions per week, ${input.minutesPerSession} minutes per session`,
    `- that is ${sessions} sessions in total; plan for at most ${sessions} lessons`,
    `- each lesson's estimated_minutes should be close to ${input.minutesPerSession}`,
    "",
    "MATERIAL ALREADY COVERED IN EARLIER PROGRAMS:",
    renderPriorMaterial(input.priorMaterial),
    "",
    `Today is ${input.now}.`,
  ].join("\n");
};
