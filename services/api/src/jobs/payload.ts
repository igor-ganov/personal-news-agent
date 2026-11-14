import { readProgress } from "@pna/core";
import type { JobRow } from "./db.js";

const parse = (value: string | null | undefined): unknown => {
  if (value === null || value === undefined) return null;
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
 * The server stores it and hands it back untouched. `progress` is only sent
 * while the job runs: a finished job's last step is not news.
 */
export const toPayload = (row: JobRow) => ({
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
  progress: row.status === "running" ? readProgress(parse(row.progress)) : null,
  attempts: row.attempts,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
