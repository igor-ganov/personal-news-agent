import { randomId } from "../crypto.js";
import type { Env } from "../env.js";
import { seal, unseal } from "../secrets.js";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobRow {
  id: string;
  account_id: string;
  task_key: string;
  kind: string;
  input: string;
  meta: string;
  status: JobStatus;
  result: string | null;
  error_kind: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const nowIso = (): string => new Date().toISOString();

/**
 * How long a job may sit in `running` before it is assumed dead.
 *
 * Only the cron runs jobs, and a cron invocation gets fifteen minutes of wall
 * clock; anything still marked running after sixteen was killed mid-flight.
 * The number used to be twenty minutes and covered a different, self-inflicted
 * case: work started in `waitUntil`, which the platform kills thirty seconds
 * after the response — so every generation died and then waited out the whole
 * stale window before anyone retried it.
 */
export const STALE_AFTER_MS = 16 * 60_000;

/** A job is retried this many times before its failure is reported to the app. */
export const MAX_ATTEMPTS = 3;

/** Finished work is kept long enough for a device that was off to come back. */
export const KEEP_FINISHED_MS = 7 * 24 * 3_600_000;

/** How many of an account's jobs a single listing returns. */
export const LIST_LIMIT = 50;

/* -------------------------------------------------------------------- read -- */

export const listJobs = async (env: Env, accountId: string): Promise<JobRow[]> => {
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?`,
  )
    .bind(accountId, LIST_LIMIT)
    .all<JobRow>();
  return results ?? [];
};

export const findJob = (env: Env, accountId: string, id: string): Promise<JobRow | null> =>
  env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<JobRow>();

export const findJobById = (env: Env, id: string): Promise<JobRow | null> =>
  env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>();

/** The live job for a key, if the account already has one. */
export const findLiveJob = (env: Env, accountId: string, key: string): Promise<JobRow | null> =>
  env.DB.prepare(
    `SELECT * FROM jobs WHERE account_id = ? AND task_key = ? AND status IN ('queued','running')`,
  )
    .bind(accountId, key)
    .first<JobRow>();

/* ------------------------------------------------------------------- write -- */

export interface NewJob {
  readonly accountId: string;
  readonly key: string;
  readonly kind: string;
  readonly input: unknown;
  readonly meta: unknown;
}

/**
 * Queues a job, unless the account already has a live one under the same key.
 *
 * The uniqueness is also a database constraint, so two devices submitting at
 * the same moment cannot both win: the loser's insert is refused and it reads
 * back the job that got in first.
 */
export const enqueueJob = async (env: Env, job: NewJob): Promise<JobRow> => {
  const existing = await findLiveJob(env, job.accountId, job.key);
  if (existing) return existing;

  const row: JobRow = {
    id: randomId(),
    account_id: job.accountId,
    task_key: job.key,
    kind: job.kind,
    input: JSON.stringify(job.input),
    meta: JSON.stringify(job.meta ?? {}),
    status: "queued",
    result: null,
    error_kind: null,
    error_message: null,
    attempts: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
    started_at: null,
    finished_at: null,
  };

  try {
    await env.DB.prepare(
      `INSERT INTO jobs (id, account_id, task_key, kind, input, meta, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
    )
      .bind(
        row.id,
        row.account_id,
        row.task_key,
        row.kind,
        row.input,
        row.meta,
        row.created_at,
        row.updated_at,
      )
      .run();
    return row;
  } catch {
    const raced = await findLiveJob(env, job.accountId, job.key);
    if (raced) return raced;
    throw new Error("job_insert_failed");
  }
};

/**
 * Claims a job for execution.
 *
 * The status check is part of the UPDATE, so of two workers that pick up the
 * same row exactly one sees a change and runs it.
 */
export const claimJob = async (env: Env, id: string): Promise<boolean> => {
  const stale = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const result = await env.DB.prepare(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, started_at = ?, updated_at = ?
     WHERE id = ? AND (status = 'queued' OR (status = 'running' AND started_at <= ?))`,
  )
    .bind(nowIso(), nowIso(), id, stale)
    .run();
  return (result.meta.changes ?? 0) > 0;
};

export const completeJob = async (env: Env, id: string, result: unknown): Promise<void> => {
  await env.DB.prepare(
    `UPDATE jobs SET status = 'done', result = ?, error_kind = NULL, error_message = NULL,
       finished_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(JSON.stringify(result), nowIso(), nowIso(), id)
    .run();
};

/**
 * Records a failure. A failure that is worth another attempt goes back to
 * `queued` instead — the app should only be shown what will not fix itself.
 */
export const failJob = async (
  env: Env,
  id: string,
  error: { kind: string; message: string },
  retryable: boolean,
): Promise<void> => {
  const row = await findJobById(env, id);
  const canRetry = retryable && (row?.attempts ?? MAX_ATTEMPTS) < MAX_ATTEMPTS;

  await env.DB.prepare(
    `UPDATE jobs SET status = ?, error_kind = ?, error_message = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      canRetry ? "queued" : "failed",
      error.kind,
      error.message,
      canRetry ? null : nowIso(),
      nowIso(),
      id,
    )
    .run();
};

export const deleteJob = async (env: Env, accountId: string, id: string): Promise<void> => {
  await env.DB.prepare("DELETE FROM jobs WHERE id = ? AND account_id = ?").bind(id, accountId).run();
};

/** Jobs that nobody is running: queued, or claimed by an invocation that died. */
export const pendingJobs = async (env: Env, limit = 10): Promise<JobRow[]> => {
  const stale = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE status = 'queued' OR (status = 'running' AND started_at <= ?)
     ORDER BY created_at LIMIT ?`,
  )
    .bind(stale, limit)
    .all<JobRow>();
  return results ?? [];
};

/**
 * Ends jobs that will not end by themselves.
 *
 * A run killed mid-flight leaves the row claimed and silent. After the attempts
 * are spent, silence is the worst possible answer: the app shows a spinner that
 * never stops. This turns it into a sentence the user can read.
 */
export const failStuckJobs = async (env: Env): Promise<number> => {
  const stale = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const result = await env.DB.prepare(
    `UPDATE jobs SET status = 'failed', error_kind = 'timeout',
       error_message = 'Генерация не уложилась во время и была остановлена',
       finished_at = ?1, updated_at = ?1
     WHERE status = 'running' AND started_at <= ?2 AND attempts >= ?3`,
  )
    .bind(new Date().toISOString(), stale, MAX_ATTEMPTS)
    .run();
  return result.meta.changes ?? 0;
};

export const pruneJobs = async (env: Env): Promise<void> => {
  const cutoff = new Date(Date.now() - KEEP_FINISHED_MS).toISOString();
  await env.DB.prepare(
    "DELETE FROM jobs WHERE status IN ('done','failed') AND updated_at <= ?",
  )
    .bind(cutoff)
    .run();
};

/* --------------------------------------------------------- provider secret -- */

export interface ProviderKeyRow {
  account_id: string;
  ciphertext: string;
  iv: string;
  model: string;
  updated_at: string;
}

export const readProviderKeyRow = (env: Env, accountId: string): Promise<ProviderKeyRow | null> =>
  env.DB.prepare("SELECT * FROM provider_keys WHERE account_id = ?")
    .bind(accountId)
    .first<ProviderKeyRow>();

export const saveProviderKey = async (
  env: Env,
  accountId: string,
  apiKey: string,
  model: string,
): Promise<void> => {
  if (!env.PROVIDER_KEY_SECRET) throw new Error("provider_key_secret_missing");
  const sealed = await seal(env.PROVIDER_KEY_SECRET, apiKey);

  await env.DB.prepare(
    `INSERT INTO provider_keys (account_id, ciphertext, iv, model, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET ciphertext = excluded.ciphertext,
       iv = excluded.iv, model = excluded.model, updated_at = excluded.updated_at`,
  )
    .bind(accountId, sealed.ciphertext, sealed.iv, model, new Date().toISOString())
    .run();
};

export const deleteProviderKey = async (env: Env, accountId: string): Promise<void> => {
  await env.DB.prepare("DELETE FROM provider_keys WHERE account_id = ?").bind(accountId).run();
};

export interface ProviderCredentials {
  readonly apiKey: string;
  readonly model: string;
}

/**
 * The credentials a job runs under: the account's own key when it uploaded one,
 * otherwise the deployment's. Without either, generation cannot happen and the
 * job fails with a message that says exactly that.
 */
export const providerCredentials = async (
  env: Env,
  accountId: string,
): Promise<ProviderCredentials | null> => {
  const row = await readProviderKeyRow(env, accountId);
  const model = row?.model || env.DEFAULT_MODEL || "";

  if (row && env.PROVIDER_KEY_SECRET) {
    const apiKey = await unseal(env.PROVIDER_KEY_SECRET, row);
    if (apiKey) return { apiKey, model };
  }
  return env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY, model } : null;
};
