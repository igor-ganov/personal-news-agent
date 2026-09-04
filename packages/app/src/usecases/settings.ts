import { ok, type DigestPeriod, type Result, type Settings } from "@pna/core";
import type { AppContext } from "../container.js";
import type { AppError } from "../errors.js";
import type { GeneratorCredentials } from "../ports/jobs.js";

export const patchSettings = (ctx: AppContext, patch: Partial<Settings>): Settings => {
  ctx.store.dispatch({ type: "settings/patch", patch });
  return ctx.store.getState().settings;
};

export const setAutoDigestPeriods = (
  ctx: AppContext,
  periods: readonly DigestPeriod[],
): Settings => patchSettings(ctx, { autoDigestPeriods: [...periods] });

/**
 * Stores the provider credential outside the state document, and — when there
 * is an account — gives the server a copy.
 *
 * Without that copy the server has nothing to generate with, and generation is
 * exactly what has to survive the app being closed. The device keeps its own
 * key so an offline build still works.
 */
export const saveApiKey = async (
  ctx: AppContext,
  value: string,
): Promise<Result<boolean, AppError>> => {
  await ctx.deps.secrets.set(value);
  const stored = (await ctx.deps.secrets.get()) !== null;

  const gateway = ctx.deps.jobs;
  if (!gateway || !stored) return ok(stored);

  const shared = await gateway.setCredentials(value, ctx.store.getState().settings.model);
  return shared.ok ? ok(true) : shared;
};

/** What the server can generate with right now, or null without an account. */
export const generatorCredentials = async (
  ctx: AppContext,
): Promise<Result<GeneratorCredentials | null, AppError>> => {
  const gateway = ctx.deps.jobs;
  if (!gateway) return ok(null);

  const read = await gateway.credentials();
  return read.ok ? ok(read.value) : read;
};

export const hasApiKey = async (ctx: AppContext): Promise<boolean> =>
  (await ctx.deps.secrets.get()) !== null;

export const clearApiKey = async (ctx: AppContext): Promise<void> => {
  await ctx.deps.secrets.clear();
};
