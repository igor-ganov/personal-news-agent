/**
 * What a long generation is doing right now, in terms the user can follow:
 * which stage it is in, what it last searched for, which sites came back, and
 * which piece of the answer it is writing.
 *
 * It is produced on whichever side runs the model — the server, or this device
 * without an account — and travels as JSON, so it is read back through
 * `readProgress` rather than trusted.
 */
export const PROGRESS_STAGES = ["queued", "thinking", "searching", "writing", "fixing"] as const;

export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export interface GenerationProgress {
  readonly stage: ProgressStage;
  /** The last web search, once its query is complete; "" before any. */
  readonly query: string;
  /** Hosts the last search came back with. */
  readonly found: readonly string[];
  /** The piece of the answer being written: a source, a section, a module. */
  readonly item: string;
  readonly searches: number;
  /** How many pieces of the answer have been started. */
  readonly items: number;
}

/** The moment the model starts on the work. */
export const STARTED_PROGRESS: GenerationProgress = {
  stage: "thinking",
  query: "",
  found: [],
  item: "",
  searches: 0,
  items: 0,
};

/** Accepted by the server, not picked up yet. */
export const QUEUED_PROGRESS: GenerationProgress = { ...STARTED_PROGRESS, stage: "queued" };

const isStage = (value: unknown): value is ProgressStage =>
  typeof value === "string" && (PROGRESS_STAGES as readonly string[]).includes(value);

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

const texts = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const fieldsOf = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

export const readProgress = (raw: unknown): GenerationProgress | null => {
  const fields = fieldsOf(raw);
  if (!fields || !isStage(fields.stage)) return null;
  return {
    stage: fields.stage,
    query: text(fields.query),
    found: texts(fields.found),
    item: text(fields.item),
    searches: count(fields.searches),
    items: count(fields.items),
  };
};

/** Field-by-field equality — progress read back from JSON is never the same object. */
export const sameProgress = (a: GenerationProgress | null, b: GenerationProgress | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.stage === b.stage &&
    a.query === b.query &&
    a.item === b.item &&
    a.searches === b.searches &&
    a.items === b.items &&
    a.found.join("\n") === b.found.join("\n"));
