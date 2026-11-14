import { randomId } from "../crypto.js";
import type { Env } from "../env.js";
import { seal, unseal } from "../secrets.js";
import type { JobStore } from "./sql.js";

export type { JobStore } from "./sql.js";

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
  heartbeat_at?: string | null;
  /** JSON `GenerationProgress` of the attempt in flight. */
  progress?: string | null;
}

const nowIso = (): string => new Date().toISOString();

/**
 * How often a running job stamps `heartbeat_at` while it waits on the model.
 */
export const HEARTBEAT_EVERY_MS = 30_000;

/**
 * How long a running job may stay silent before it is assumed dead.
 *
 * Liveness is the heartbeat, not the start time: a generation may run for many
 * minutes, but an invocation that is still alive stamps the row every half
 * minute. Six missed beats means the isolate was killed — out of CPU, evicted,
 * redeployed — and nothing will ever finish the row unless the sweep does.
 * Rows claimed before the heartbeat existed fall back to `started_at`.
 */
export const STALE_AFTER_MS = 3 * 60_000;

/** The SQL expression a job's last sign of life is read from. */
const LAST_SEEN = "COALESCE(heartbeat_at, started_at)";

const staleBefore = (): string => new Date(Date.now() - STALE_AFTER_MS).toISOString();

/**
 * The rows a worker may take: queued, or claimed by a run that went silent —
 * and in both cases only while attempts remain. Without the cap a run killed
 * every time (out of CPU, say) is re-claimed forever and the app spins forever.
 * The arguments are the placeholders the staleness cutoff and the cap bind to.
 */
const claimable = (stale: string, maxAttempts: string): string =>
  `attempts < ${maxAttempts} AND (status = 'queued' OR (status = 'running' AND ${LAST_SEEN} <= ${stale}))`;

/** Shown when the server gave up on a job whose runs kept dying. */
export const STUCK_JOB_MESSAGE = "Генерация прервалась на сервере. Попробуйте ещё раз.";

/** A job is retried this many times before its failure is reported to the app. */
export const MAX_ATTEMPTS = 3;

/** Finished work is kept long enough for a device that was off to come back. */
export const KEEP_FINISHED_MS = 7 * 24 * 3_600_000;

/** How many of an account's jobs a single listing returns. */
export const LIST_LIMIT = 50;

/* -------------------------------------------------------------------- read -- */

export const listJobs = async (env: JobStore, accountId: string): Promise<JobRow[]> => {
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?`,
  )
    .bind(accountId, LIST_LIMIT)
    .all<JobRow>();
  return results ?? [];
};

export const findJob = (env: JobStore, accountId: string, id: string): Promise<JobRow | null> =>
  env.DB.prepare("SELECT * FROM jobs WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .first<JobRow>();

export const findJobById = (env: JobStore, id: string): Promise<JobRow | null> =>
  env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>();

/** The live job for a key, if the account already has one. */
export const findLiveJob = (env: JobStore, accountId: string, key: string): Promise<JobRow | null> =>
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
export const enqueueJob = async (env: JobStore, job: NewJob): Promise<JobRow> => {
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
export const claimJob = async (env: JobStore, id: string): Promise<boolean> => {
  const now = nowIso();
  const result = await env.DB.prepare(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, progress = NULL,
       started_at = ?1, heartbeat_at = ?1, updated_at = ?1
     WHERE id = ?2 AND ${claimable("?3", "?4")}`,
  )
    .bind(now, id, staleBefore(), MAX_ATTEMPTS)
    .run();
  return (result.meta.changes ?? 0) > 0;
};

/**
 * Says a claimed job is still being worked on. Only a row that is still
 * running is touched, so a beat that lands after the result changes nothing.
 */
export const touchJob = async (env: JobStore, id: string): Promise<void> => {
  await env.DB.prepare(
    `UPDATE jobs SET heartbeat_at = ? WHERE id = ? AND status = 'running'`,
  )
    .bind(nowIso(), id)
    .run();
};

/**
 * Records what the running job is doing. It is also a sign of life, so it
 * stamps the heartbeat; like the beat, it never touches a finished row.
 */
export const saveProgress = async (env: JobStore, id: string, progress: unknown): Promise<void> => {
  await env.DB.prepare(
    `UPDATE jobs SET progress = ?, heartbeat_at = ? WHERE id = ? AND status = 'running'`,
  )
    .bind(JSON.stringify(progress), nowIso(), id)
    .run();
};

export const completeJob = async (env: JobStore, id: string, result: unknown): Promise<void> => {
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
  env: JobStore,
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

export const deleteJob = async (env: JobStore, accountId: string, id: string): Promise<void> => {
  await env.DB.prepare("DELETE FROM jobs WHERE id = ? AND account_id = ?").bind(id, accountId).run();
};

/** Jobs that nobody is running: queued, or claimed by an invocation that died. */
export const pendingJobs = async (env: JobStore, limit = 10): Promise<JobRow[]> => {
  const { results } = await env.DB.prepare(
    `SELECT * FROM jobs WHERE ${claimable("?1", "?2")} ORDER BY created_at LIMIT ?3`,
  )
    .bind(staleBefore(), MAX_ATTEMPTS, limit)
    .all<JobRow>();
  return results ?? [];
};

/**
 * Ends jobs that will not end by themselves.
 *
 * A run killed mid-flight leaves the row claimed and silent. After the attempts
 * are spent, silence is the worst possible answer: the app shows a spinner that
 * never stops. This turns it into a sentence the user can read. The row ends
 * `failed`, which nothing re-queues: retrying is the user's call now.
 */
export const failStuckJobs = async (env: JobStore): Promise<number> => {
  const result = await env.DB.prepare(
    `UPDATE jobs SET status = 'failed', error_kind = 'timeout', error_message = ?1,
       finished_at = ?2, updated_at = ?2
     WHERE status = 'running' AND ${LAST_SEEN} <= ?3 AND attempts >= ?4`,
  )
    .bind(STUCK_JOB_MESSAGE, nowIso(), staleBefore(), MAX_ATTEMPTS)
    .run();
  return result.meta.changes ?? 0;
};

export const pruneJobs = async (env: JobStore): Promise<void> => {
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

export const readProviderKeyRow = (env: JobStore, accountId: string): Promise<ProviderKeyRow | null> =>
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

export const deleteProviderKey = async (env: JobStore, accountId: string): Promise<void> => {
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
