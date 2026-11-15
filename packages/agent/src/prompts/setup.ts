import { WIZARD_INTENSITY, type SetupKind } from "@pna/core";
import type { SetupInput } from "../ports/content-provider.js";
import { BASE_SYSTEM, renderTopicContext } from "./context.js";

export const SETUP_TOOL = "emit_setup";

const { weeks, sessionsPerWeek, minutesPerSession } = WIZARD_INTENSITY;

/** What each kind of card needs filled in, field by field. */
const ASK: Readonly<Record<SetupKind, readonly string[]>> = {
  topic: [
    "The user has just named a TOPIC to follow. Fill in the rest of its card.",
    "brief: 2–4 sentences, in the user's voice, on what they most likely want to follow in it.",
    "level: beginner, intermediate or advanced — what the name and the context suggest.",
    "focus: 3–5 focus areas within the topic, each a short phrase.",
    "excludes: 0–3 things such a reader usually does not want (hype, marketing, unrelated audiences); empty if nothing obvious.",
  ],
  skill: [
    "The user has just stated a SKILL they want to learn. Propose a realistic time budget for a study program.",
    `weeks: ${weeks.min}–${weeks.max}; sessionsPerWeek: ${sessionsPerWeek.min}–${sessionsPerWeek.max}; minutesPerSession: ${minutesPerSession.min}–${minutesPerSession.max}.`,
    "Size it to the skill: a narrow practical skill needs a few weeks, a broad one more. Prefer a pace a working adult keeps up.",
    "note: one sentence, in the user's language, on why this budget fits — it is shown next to the sliders.",
  ],
};

export const setupSystem = (): string =>
  [
    BASE_SYSTEM,
    "",
    "Your job right now: propose the settings of a card the user is filling in, from the name they typed.",
    "Answer from what you know — do not search. Everything you propose stays editable.",
    `Call ${SETUP_TOOL} once with the settings.`,
  ].join("\n");

const whereItGoes = (input: SetupInput): readonly string[] =>
  input.context
    ? [renderTopicContext(input.context), ""]
    : [`OUTPUT LANGUAGE: ${input.language}`, "This is a new top-level topic; there is no wider context.", ""];

export const setupPrompt = (input: SetupInput): string =>
  [...whereItGoes(input), `NAME TYPED BY THE USER: ${input.title}`, "", ...ASK[input.kind]].join("\n");
