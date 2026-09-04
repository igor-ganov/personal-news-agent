import { isAgentJobKind } from "@pna/agent";
import { Hono } from "hono";
import { hitRateLimit } from "../db.js";
import type { Env } from "../env.js";
import { badRequest, fail, readJson, tooManyRequests, unauthorized } from "../http.js";
import {
  deleteJob,
  enqueueJob,
  findJob,
  listJobs,
  type JobRow,
} from "../jobs/db.js";
import { resumeAccountJobs, runJob } from "../jobs/runner.js";
import { requestAccount } from "../session.js";

/** Enough headroom for a person on several devices, low enough to blunt a script. */
const SUBMIT_LIMIT = 60;
const SUBMIT_WINDOW_MS = 3_600_000;

const MAX_INPUT_BYTES = 512 * 1024;

const parse = (value: string | null): unknown => {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

/**
 * The wire shape of a job.
 *
 * `meta` is whatever the app needs to make sense of the answer when it comes
 * back — which lesson the lecture belongs to, which topic the digest was for.
 * The server stores it and hands it back untouched.
 */
const toPayload = (row: JobRow) => ({
  id: row.id,
  key: row.task_key,
  kind: row.kind,
  status: row.status,
  meta: parse(row.meta) ?? {},
  result: row.status === "done" ? parse(row.result) : null,
  error:
    row.status === "failed"
      ? { kind: row.error_kind ?? "unknown", message: row.error_message ?? "Не получилось" }
      : null,
  attempts: row.attempts,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const jobRoutes = new Hono<{ Bindings: Env }>();

/**
 * Everything the account has in flight or has finished recently.
 *
 * Reading the list also revives work nobody is running: a device that comes
 * back after its own invocation was killed restarts the generation by the very
 * act of asking about it.
 */
jobRoutes.get("/", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  const rows = await listJobs(c.env, account.id);
  c.executionCtx.waitUntil(resumeAccountJobs(c.env, account.id));
  return c.json({ jobs: rows.map(toPayload) });
});

jobRoutes.get("/:id", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  const row = await findJob(c.env, account.id, c.req.param("id"));
  if (!row) return fail(c, 404, "not_found", "Задание не найдено");
  return c.json({ job: toPayload(row) });
});

/**
 * Queues a generation.
 *
 * The response comes back immediately with the job; the model call runs after
 * it, in the same invocation, so the phone can close the connection — or the
 * app itself — the moment it has the id.
 */
jobRoutes.post("/", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  const payload = await readJson<{
    key?: unknown;
    kind?: unknown;
    input?: unknown;
    meta?: unknown;
  }>(c);
  if (!payload) return badRequest(c, "Нужно тело запроса");

  const { key, kind, input } = payload;
  if (typeof key !== "string" || key.length === 0 || key.length > 200)
    return badRequest(c, "Нужен ключ задания");
  if (!isAgentJobKind(kind)) return badRequest(c, "Неизвестный вид задания");
  if (typeof input !== "object" || input === null) return badRequest(c, "Нужны входные данные");

  const encoded = JSON.stringify(input);
  if (encoded.length > MAX_INPUT_BYTES)
    return fail(c, 413, "input_too_large", "Задание слишком большое");

  if (!(await hitRateLimit(c.env, "jobs", account.id, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)))
    return tooManyRequests(c);

  const row = await enqueueJob(c.env, {
    accountId: account.id,
    key,
    kind,
    input,
    meta: payload.meta ?? {},
  });

  if (row.status === "queued") c.executionCtx.waitUntil(runJob(c.env, row));
  return c.json({ job: toPayload(row) }, 202);
});

/**
 * The app is done with a job: it applied the result, or dismissed the failure.
 * Removing the row is what keeps a finished digest from being applied twice and
 * a dismissed error from coming back on the next screen.
 */
jobRoutes.delete("/:id", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  await deleteJob(c.env, account.id, c.req.param("id"));
  return c.json({ ok: true });
});
