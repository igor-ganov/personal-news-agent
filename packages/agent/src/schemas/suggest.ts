import { readSuggestions, type Suggestion } from "@pna/core";
import { z } from "zod";

export const suggestionSchema = z.strictObject({
  title: z.string(),
  summary: z.string(),
  brief: z.string(),
  focus: z.array(z.string()),
});

export const suggestSchema = z.strictObject({
  suggestions: z.array(suggestionSchema),
});

export type SuggestPayload = z.infer<typeof suggestSchema>;

/** Trims and drops ideas the model left without a title. */
export const toSuggestions = (payload: SuggestPayload): Suggestion[] => [
  ...readSuggestions(payload.suggestions),
];
