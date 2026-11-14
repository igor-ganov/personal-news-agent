import { createMockProvider, type ContentProvider } from "@pna/agent";
import { ok, STARTED_PROGRESS } from "@pna/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimJob, findJobById, HEARTBEAT_EVERY_MS } from "../src/jobs/db.js";
import { createRunner, JOBS_PER_TICK, PROGRESS_EVERY_MS, type RunnerDeps } from "../src/jobs/runner.js";
import { createTestDatabase, type TestDatabase } from "./support/d1.js";

const NOW = Date.parse("2026-11-01T12:00:00.000Z");

const queue = (db: TestDatabase, ids: readonly string[]): void =>
  ids.forEach((id, index) =>
    db.sqlite
      .prepare(
        `INSERT INTO jobs (id, account_id, task_key, kind, input, status, attempts, created_at, updated_at)
         VALUES (?, 'acc', ?, 'sources', '{}', 'queued', 0, ?, ?)`,
      )
      .run(id, `sources:${id}`, new Date(NOW + index).toISOString(), new Date(NOW).toISOString()),
  );

/** A provider whose source discovery finds nothing once `gate` settles. */
const providerAfter = (gate: Promise<void>, onStart: () => void = () => undefined): ContentProvider => ({
  ...createMockProvider(),
  discoverSources: async () => {
    onStart();
    await gate;
    return ok([]);
  },
});

interface Gated {
  readonly provider: ContentProvider;
  /** Settles once the model call has begun — the heartbeat is running by then. */
  readonly started: Promise<void>;
  readonly release: () => void;
}

/** A provider whose source discovery waits until the test lets it finish. */
const gatedProvider = (): Gated => {
  let release = (): void => undefined;
  let start = (): void => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (start = resolve));
  return { provider: providerAfter(gate, () => start()), started, release: () => release() };
};

const depsWith = (provider: ContentProvider): RunnerDeps => ({
  credentials: async () => ({ apiKey: "sk-test", model: "claude-opus-5-5" }),
  provider: () => provider,
});

describe("job runner", () => {
  let db: TestDatabase;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(NOW);
    db = createTestDatabase();
  });
  afterEach(() => vi.useRealTimers());

  it("takes at most two jobs per cron tick", async () => {
    queue(db, ["a", "b", "c"]);
    const claimed = vi.fn();
    const provider = providerAfter(Promise.resolve());

    await createRunner(db, { ...depsWith(provider), onClaim: claimed }).runPending();

    expect(JOBS_PER_TICK).toBe(2);
    expect(claimed.mock.calls.map(([id]) => id)).toEqual(["a", "b"]);
    expect((await findJobById(db, "c"))?.status).toBe("queued");
  });

  it("stamps a heartbeat while the model call is in flight", async () => {
    queue(db, ["slow"]);
    const { provider, started, release } = gatedProvider();
    const running = createRunner(db, depsWith(provider)).runPending();

    await started;
    const claimedAt = (await findJobById(db, "slow"))?.heartbeat_at;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_EVERY_MS);
    const beat = (await findJobById(db, "slow"))?.heartbeat_at;

    release();
    await running;

    expect(claimedAt).toBe(new Date(NOW).toISOString());
    expect(beat).toBe(new Date(NOW + HEARTBEAT_EVERY_MS).toISOString());
    expect((await findJobById(db, "slow"))?.status).toBe("done");
  });

  it("saves what the model is doing while it runs", async () => {
    queue(db, ["live"]);
    let release = (): void => undefined;
    let start = (): void => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (start = resolve));
    const provider: ContentProvider = {
      ...createMockProvider(),
      discoverSources: async (_input, options) => {
        options?.onProgress?.({ ...STARTED_PROGRESS, stage: "searching", query: "tokio", searches: 1 });
        start();
        await gate;
        return ok([]);
      },
    };
    const running = createRunner(db, depsWith(provider)).runPending();

    await started;
    await vi.advanceTimersByTimeAsync(PROGRESS_EVERY_MS);
    const saved = (await findJobById(db, "live"))?.progress;

    release();
    await running;

    expect(JSON.parse(saved ?? "null")).toMatchObject({ stage: "searching", query: "tokio", searches: 1 });
  });

  it("a new attempt starts without the progress of the one that died", async () => {
    queue(db, ["retry"]);
    db.sqlite
      .prepare("UPDATE jobs SET progress = ?, status = 'running', attempts = 1, started_at = ? WHERE id = 'retry'")
      .run(JSON.stringify({ ...STARTED_PROGRESS, stage: "writing" }), new Date(NOW - 10 * 60_000).toISOString());

    expect(await claimJob(db, "retry")).toBe(true);
    expect((await findJobById(db, "retry"))?.progress ?? null).toBeNull();
  });
});
