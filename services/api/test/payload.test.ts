import { STARTED_PROGRESS } from "@pna/core";
import { describe, expect, it } from "vitest";
import type { JobRow } from "../src/jobs/db.js";
import { toPayload } from "../src/jobs/payload.js";

const row = (over: Partial<JobRow>): JobRow => ({
  id: "j1",
  account_id: "acc",
  task_key: "sources:t1",
  kind: "sources",
  input: "{}",
  meta: "{}",
  status: "running",
  result: null,
  error_kind: null,
  error_message: null,
  attempts: 1,
  created_at: "2026-11-01T12:00:00.000Z",
  updated_at: "2026-11-01T12:00:00.000Z",
  started_at: "2026-11-01T12:00:00.000Z",
  finished_at: null,
  ...over,
});

const searching = { ...STARTED_PROGRESS, stage: "searching" as const, query: "tokio" };

describe("job payload", () => {
  it("carries the progress of a running job", () => {
    expect(toPayload(row({ progress: JSON.stringify(searching) })).progress).toEqual(searching);
  });

  it("has no progress once the job is over", () => {
    expect(toPayload(row({ status: "done", result: "[]", progress: JSON.stringify(searching) })).progress).toBeNull();
  });

  it("has no progress when the stored one is unreadable", () => {
    expect(toPayload(row({ progress: "{oops" })).progress).toBeNull();
  });
});
