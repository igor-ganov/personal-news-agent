import { readSetup, TOPIC_LEVELS, type Setup, type SetupKind } from "@pna/core";
import { z } from "zod";

export const topicSetupSchema = z.strictObject({
  brief: z.string(),
  level: z.enum(TOPIC_LEVELS),
  focus: z.array(z.string()),
  excludes: z.array(z.string()),
});

export const skillSetupSchema = z.strictObject({
  weeks: z.number(),
  sessionsPerWeek: z.number(),
  minutesPerSession: z.number(),
  note: z.string(),
});

/** The tool schema the model fills, per kind of card. */
export const SETUP_SCHEMAS: { readonly [K in SetupKind]: z.ZodType<unknown> } = {
  topic: topicSetupSchema,
  skill: skillSetupSchema,
};

/**
 * The validated payload as the app's setup. Numbers outside the wizard's
 * ranges are clamped rather than rejected — a budget of 30 weeks is still a
 * useful answer, shown as the longest the wizard allows.
 */
export const toSetup =
  (kind: SetupKind) =>
  (payload: unknown): Setup | undefined =>
    readSetup(kind, payload);
