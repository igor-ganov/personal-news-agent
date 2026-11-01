import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimJob,
  failStuckJobs,
  findJobById,
  MAX_ATTEMPTS,
  pendingJobs,
  type JobRow,
} from "../src/jobs/db.js";
import { createTestDatabase, type TestDatabase } from "./support/d1.js";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");
const minutesAgo = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

interface Seed {
  readonly id: string;
  readonly status: JobRow["status"];
  readonly attempts: number;
  readonly startedMinutesAgo?: number;
  readonly heartbeatMinutesAgo?: number;
}

const seed = (db: TestDatabase, job: Seed): void => {
  db.sqlite
    .prepare(
      `INSERT INTO jobs (id, account_id, task_key, kind, input, status, attempts, created_at, updated_at, started_at)
       VALUES (?, 'acc', ?, 'program', '{}', ?, ?, ?, ?, ?)`,
    )
    .run(
      job.id,
      `key:${job.id}`,
      job.status,
      job.attempts,
      minutesAgo(60),
      minutesAgo(60),
      job.startedMinutesAgo === undefined ? null : minutesAgo(job.startedMinutesAgo),
    );
  if (job.heartbeatMinutesAgo !== undefined)
    db.sqlite
      .prepare("UPDATE jobs SET heartbeat_at = ? WHERE id = ?")
      .run(minutesAgo(job.heartbeatMinutesAgo), job.id);
};

describe("job queue liveness", () => {
  let db: TestDatabase;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    db = createTestDatabase();
  });
  afterEach(() => vi.useRealTimers());

  it("does not hand out a dead job whose attempts are spent", async () => {
    seed(db, { id: "spent", status: "running", attempts: MAX_ATTEMPTS, startedMinutesAgo: 30 });

    expect((await pendingJobs(db)).map((row) => row.id)).toEqual([]);
    expect(await claimJob(db, "spent")).toBe(false);
  });

  it("re-claims a job whose run went silent minutes ago, not a quarter of an hour", async () => {
    seed(db, { id: "silent", status: "running", attempts: 1, startedMinutesAgo: 4 });

    expect((await pendingJobs(db)).map((row) => row.id)).toEqual(["silent"]);
    expect(await claimJob(db, "silent")).toBe(true);
  });

  it("leaves alone a long run that is still beating", async () => {
    seed(db, {
      id: "alive",
      status: "running",
      attempts: 1,
      startedMinutesAgo: 30,
      heartbeatMinutesAgo: 0.5,
    });

    expect(await pendingJobs(db)).toEqual([]);
    expect(await claimJob(db, "alive")).toBe(false);
    expect(await failStuckJobs(db)).toBe(0);
  });

  it("turns a dead job with no attempts left into a failure the app can show", async () => {
    seed(db, { id: "spent", status: "running", attempts: MAX_ATTEMPTS, startedMinutesAgo: 4 });

    expect(await failStuckJobs(db)).toBe(1);
    expect(await findJobById(db, "spent")).toMatchObject({
      status: "failed",
      error_kind: "timeout",
      error_message: "Генерация прервалась на сервере. Попробуйте ещё раз.",
    });
  });
});
