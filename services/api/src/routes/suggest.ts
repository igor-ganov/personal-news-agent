import { Hono } from "hono";
import { hitRateLimit } from "../db.js";
import type { Env } from "../env.js";
import { badRequest, fail, readJson, tooManyRequests, unauthorized } from "../http.js";
import { runnerDeps } from "../jobs/runner.js";
import { requestAccount } from "../session.js";
import { readSuggestRequest, suggestFor } from "../suggest.js";

/** Each tap of «ещё» is one call; this is generous for a person and tight for a script. */
const SUGGEST_LIMIT = 120;
const SUGGEST_WINDOW_MS = 3_600_000;

const MAX_INPUT_BYTES = 64 * 1024;

export const suggestRoutes = new Hono<{ Bindings: Env }>();

suggestRoutes.post("/", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  const payload = await readJson<unknown>(c);
  if (JSON.stringify(payload ?? null).length > MAX_INPUT_BYTES)
    return fail(c, 413, "input_too_large", "Запрос слишком большой");

  const input = readSuggestRequest(payload);
  if (!input) return badRequest(c, "Нужны вид подсказок и тема");

  if (!(await hitRateLimit(c.env, "suggest", account.id, SUGGEST_LIMIT, SUGGEST_WINDOW_MS)))
    return tooManyRequests(c);

  const result = await suggestFor(runnerDeps(c.env), account.id, input);
  if (!result.ok) return fail(c, 502, result.error.kind, result.error.message);
  return c.json({ suggestions: result.value });
});
