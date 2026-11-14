import { describe, expect, it } from "vitest";
import { QUEUED_PROGRESS, readProgress, STARTED_PROGRESS } from "./progress.js";

describe("readProgress — progress that came back over the wire", () => {
  it("reads a well-formed report", () => {
    const raw = { stage: "searching", query: "rust async", found: ["a.dev"], item: "", searches: 2, items: 0 };
    expect(readProgress(raw)).toEqual(raw);
  });

  it("rejects anything without a known stage", () => {
    expect(readProgress(null)).toBeNull();
    expect(readProgress({ stage: "dancing" })).toBeNull();
    expect(readProgress("searching")).toBeNull();
  });

  it("fills what is missing and drops what is malformed", () => {
    expect(readProgress({ stage: "writing", found: ["a.dev", 4], searches: "x" })).toEqual({
      ...STARTED_PROGRESS,
      stage: "writing",
      found: ["a.dev"],
    });
  });

  it("keeps the queued state distinct from a started one", () => {
    expect(QUEUED_PROGRESS.stage).toBe("queued");
    expect(STARTED_PROGRESS.stage).toBe("thinking");
  });
});
