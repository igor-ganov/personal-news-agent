import { describe, expect, it } from "vitest";
import { createJobsClient } from "./jobs.js";
import { createTransport, type Transport } from "./transport.js";

const serving = (jobs: unknown[]): Transport =>
  createTransport({
    baseUrl: "https://api.example",
    fetch: async () => Response.json({ jobs }),
  });

const job = (over: Record<string, unknown>) => ({
  id: "job_1",
  key: "program:topic_1",
  kind: "program",
  status: "running",
  createdAt: "2026-08-22T10:00:00.000Z",
  ...over,
});

describe("createJobsClient.list", () => {
  it("treats a status it does not know as a failure, not as queued forever", async () => {
    const listed = await createJobsClient(serving([job({ status: "exploded" })])).list("token");

    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value[0]).toMatchObject({ status: "failed" });
    expect(listed.value[0]?.error?.message).toContain("exploded");
  });

  it("keeps when the job was created, so the app can time it", async () => {
    const listed = await createJobsClient(serving([job({})])).list("token");

    if (!listed.ok) throw new Error("expected ok");
    expect(listed.value[0]?.createdAt).toBe("2026-08-22T10:00:00.000Z");
  });
});
