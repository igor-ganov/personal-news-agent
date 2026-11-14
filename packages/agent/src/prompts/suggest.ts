import type { SuggestionKind } from "@pna/core";
import type { SuggestInput } from "../ports/content-provider.js";
import { BASE_SYSTEM, renderTopicContext } from "./context.js";

export const SUGGEST_TOOL = "emit_suggestions";

/** What each kind of idea is, and what its `brief` is used for. */
const ASK: Readonly<Record<SuggestionKind, readonly string[]>> = {
  subtopic: [
    "Propose SUBTOPICS of the current topic this user could follow on their own.",
    "Each must be narrower than the current topic and specific enough to have its own news and sources.",
    "title: a short name for the subtopic (2–6 words).",
    "summary: one line on why it fits this user.",
    "brief: 2–4 sentences, in the user's voice, on what they want to follow in it — it becomes the subtopic's description.",
    "focus: 2–4 focus areas within the subtopic, each a short phrase.",
  ],
  skill: [
    "Propose SKILLS this user could build as a study program within the current topic.",
    "Each must be something concrete they could practise and check, not a field of knowledge.",
    "title: a short name for the skill (2–7 words).",
    "summary: one line on what they will be able to do afterwards.",
    "brief: 1–3 sentences, in the user's voice, stating what they want to achieve — it becomes the program's goal.",
    "focus: leave empty.",
  ],
};

export const suggestSystem = (): string =>
  [
    BASE_SYSTEM,
    "",
    "Your job right now: offer ideas the user will pick from to fill in a card.",
    "Answer from what you know — do not search. Be specific to this user's level and focus areas.",
    `Call ${SUGGEST_TOOL} once with the ideas.`,
  ].join("\n");

const alreadyThere = (titles: readonly string[]): string =>
  titles.length === 0 ? "(none)" : titles.map((title) => `- ${title}`).join("\n");

export const suggestPrompt = (input: SuggestInput): string =>
  [
    renderTopicContext(input.context),
    "",
    "ALREADY THERE OR ALREADY OFFERED — never repeat or rephrase these:",
    alreadyThere(input.exclude),
    "",
    ...ASK[input.kind],
    "",
    `Give exactly ${input.count} ideas, most useful first, all different from each other.`,
  ].join("\n");
