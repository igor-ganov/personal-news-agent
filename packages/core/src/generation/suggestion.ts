/**
 * An idea to start a card from: a subtopic to add, or a skill to learn.
 *
 * The user picks one and gets an editable card, never a finished object — the
 * idea only saves typing.
 */
export const SUGGESTION_KINDS = ["subtopic", "skill"] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export interface Suggestion {
  readonly title: string;
  /** One line, shown in the list. */
  readonly summary: string;
  /** What fills the card: a subtopic's brief, or what a skill should achieve. */
  readonly brief: string;
  /** A subtopic's focus areas; empty for a skill. */
  readonly focus: readonly string[];
}

/** How many ideas one tap asks for. */
export const SUGGESTION_BATCH = 10;

export const isSuggestionKind = (value: unknown): value is SuggestionKind =>
  typeof value === "string" && (SUGGESTION_KINDS as readonly string[]).includes(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const texts = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map(text).filter((item) => item.length > 0) : [];

const readOne = (raw: unknown): readonly Suggestion[] => {
  if (typeof raw !== "object" || raw === null) return [];
  const fields = raw as Record<string, unknown>;
  const title = text(fields.title);
  return title.length === 0
    ? []
    : [{ title, summary: text(fields.summary), brief: text(fields.brief), focus: texts(fields.focus) }];
};

export const readSuggestions = (raw: unknown): readonly Suggestion[] =>
  Array.isArray(raw) ? raw.flatMap(readOne) : [];

const keyOf = (title: string): string => title.toLowerCase().replace(/\s+/g, " ").trim();

/** The shown list plus the new batch, with anything already shown left out. */
export const appendSuggestions = (
  shown: readonly Suggestion[],
  batch: readonly Suggestion[],
): readonly Suggestion[] => {
  const seen = new Set(shown.map((idea) => keyOf(idea.title)));
  const fresh = batch.filter((idea) => {
    const key = keyOf(idea.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...shown, ...fresh];
};
