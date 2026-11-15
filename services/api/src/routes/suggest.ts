import type { ProviderResult } from "@pna/agent";
import { Hono, type Context } from "hono";
import { hitRateLimit } from "../db.js";
import type { Env } from "../env.js";
import { badRequest, fail, readJson, tooManyRequests, unauthorized } from "../http.js";
import { runnerDeps, type RunnerDeps } from "../jobs/runner.js";
import { requestAccount } from "../session.js";
import { readSetupRequest, readSuggestRequest, setupFor, suggestFor } from "../suggest.js";

/**
 * Each tap of «ещё» and each typed name is one call; this is generous for a
 * person and tight for a script. Ideas and settings share it.
 */
const SUGGEST_LIMIT = 120;
const SUGGEST_WINDOW_MS = 3_600_000;

const MAX_INPUT_BYTES = 64 * 1024;

interface QuickCall<I, O> {
  readonly read: (raw: unknown) => I | undefined;
  /** Shown when the request cannot be read. */
  readonly missing: string;
  readonly run: (deps: RunnerDeps, accountId: string, input: I) => Promise<ProviderResult<O>>;
  /** The response field the answer goes under. */
  readonly field: string;
}

/** One short model call answered in the request: signed in, size-capped, rate-limited. */
const quickCall =
  <I, O>({ read, missing, run, field }: QuickCall<I, O>) =>
  async (c: Context<{ Bindings: Env }>) => {
    const account = await requestAccount(c);
    if (!account) return unauthorized(c);

    const payload = await readJson<unknown>(c);
    if (JSON.stringify(payload ?? null).length > MAX_INPUT_BYTES)
      return fail(c, 413, "input_too_large", "Запрос слишком большой");

    const input = read(payload);
    if (!input) return badRequest(c, missing);

    if (!(await hitRateLimit(c.env, "suggest", account.id, SUGGEST_LIMIT, SUGGEST_WINDOW_MS)))
      return tooManyRequests(c);

    const result = await run(runnerDeps(c.env), account.id, input);
    if (!result.ok) return fail(c, 502, result.error.kind, result.error.message);
    return c.json({ [field]: result.value });
  };

export const suggestRoutes = new Hono<{ Bindings: Env }>();

suggestRoutes.post(
  "/",
  quickCall({ read: readSuggestRequest, missing: "Нужны вид подсказок и тема", run: suggestFor, field: "suggestions" }),
);

suggestRoutes.post(
  "/setup",
  quickCall({ read: readSetupRequest, missing: "Нужны вид карточки и название", run: setupFor, field: "setup" }),
);
