import { ok, type DigestPeriod, type Result, type Settings } from "@pna/core";
import type { AppContext } from "../container.js";
import type { AppError } from "../errors.js";

export const patchSettings = (ctx: AppContext, patch: Partial<Settings>): Settings => {
  ctx.store.dispatch({ type: "settings/patch", patch });
  return ctx.store.getState().settings;
};

export const setAutoDigestPeriods = (
  ctx: AppContext,
  periods: readonly DigestPeriod[],
): Settings => patchSettings(ctx, { autoDigestPeriods: [...periods] });

/** Stores the provider credential outside the state document. */
export const saveApiKey = async (
  ctx: AppContext,
  value: string,
): Promise<Result<boolean, AppError>> => {
  await ctx.deps.secrets.set(value);
  return ok((await ctx.deps.secrets.get()) !== null);
};

export const hasApiKey = async (ctx: AppContext): Promise<boolean> =>
  (await ctx.deps.secrets.get()) !== null;

export const clearApiKey = async (ctx: AppContext): Promise<void> => {
  await ctx.deps.secrets.clear();
};
