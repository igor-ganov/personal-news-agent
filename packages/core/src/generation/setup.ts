import { TOPIC_LEVELS, type TopicLevel } from "../model/topic.js";

/**
 * Settings proposed for a card once the user has typed its name: a topic's
 * description, level, focus and exclusions, or a skill's time budget.
 *
 * Like an idea, a setup only saves typing — the card stays editable, and
 * nothing the user wrote by hand is replaced by it.
 */
export const SETUP_KINDS = ["topic", "skill"] as const;

export type SetupKind = (typeof SETUP_KINDS)[number];

export interface TopicSetup {
  readonly kind: "topic";
  readonly brief: string;
  readonly level: TopicLevel;
  readonly focus: readonly string[];
  readonly excludes: readonly string[];
}

export interface SkillSetup {
  readonly kind: "skill";
  readonly weeks: number;
  readonly sessionsPerWeek: number;
  readonly minutesPerSession: number;
  /** One line on why this budget fits the goal. */
  readonly note: string;
}

export type Setup = TopicSetup | SkillSetup;

/** The ranges the program wizard's sliders offer; a proposal outside them is clamped. */
export const WIZARD_INTENSITY = {
  weeks: { min: 1, max: 26 },
  sessionsPerWeek: { min: 1, max: 7 },
  minutesPerSession: { min: 15, max: 120 },
} as const;

type IntensityField = keyof typeof WIZARD_INTENSITY;

export const isSetupKind = (value: unknown): value is SetupKind =>
  typeof value === "string" && (SETUP_KINDS as readonly string[]).includes(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const texts = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map(text).filter((item) => item.length > 0) : [];

const isLevel = (value: unknown): value is TopicLevel =>
  typeof value === "string" && (TOPIC_LEVELS as readonly string[]).includes(value);

const clamped = (field: IntensityField, value: unknown): number | undefined => {
  const { min, max } = WIZARD_INTENSITY[field];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : undefined;
};

type Fields = Readonly<Record<string, unknown>>;

const READ: { readonly [K in SetupKind]: (fields: Fields) => Extract<Setup, { kind: K }> | undefined } = {
  topic: (fields) => ({
    kind: "topic",
    brief: text(fields.brief),
    level: isLevel(fields.level) ? fields.level : "intermediate",
    focus: texts(fields.focus),
    excludes: texts(fields.excludes),
  }),
  skill: (fields) => {
    const weeks = clamped("weeks", fields.weeks);
    const sessionsPerWeek = clamped("sessionsPerWeek", fields.sessionsPerWeek);
    const minutesPerSession = clamped("minutesPerSession", fields.minutesPerSession);
    return weeks === undefined || sessionsPerWeek === undefined || minutesPerSession === undefined
      ? undefined
      : { kind: "skill", weeks, sessionsPerWeek, minutesPerSession, note: text(fields.note) };
  },
};

const isFields = (raw: unknown): raw is Fields => typeof raw === "object" && raw !== null && !Array.isArray(raw);

/** Reads a proposal that came back from the model or over the wire. */
export const readSetup = <K extends SetupKind>(kind: K, raw: unknown): Setup | undefined =>
  isFields(raw) ? READ[kind](raw) : undefined;
