import type { SetupInput } from "@pna/agent";
import { err, ok, topicId } from "@pna/core";
import { describe, expect, it } from "vitest";
import { appError } from "../errors.js";
import type { JobsGateway } from "../ports/jobs.js";
import { failingProvider, harness } from "../testing/harness.js";
import { latestOnly, proposeSetup } from "./setup.js";
import { addTopic } from "./topics.js";

const withTopic = (options: Parameters<typeof harness>[0] = {}) => {
  const h = harness(options);
  const created = addTopic(h.ctx, { parentId: null, title: "Rust", language: "en" });
  if (!created.ok) throw new Error("expected ok");
  return { ...h, topicId: created.value.id };
};

const recording = () => {
  const asked: SetupInput[] = [];
  const gateway: Pick<JobsGateway, "setup"> = {
    setup: async (request) => {
      asked.push(request);
      return ok({ kind: "skill", weeks: 3, sessionsPerWeek: 2, minutesPerSession: 30, note: "" });
    },
  };
  return { asked, jobs: gateway as JobsGateway };
};

describe("proposeSetup — settings for a card from the name typed", () => {
  it("proposes a new top-level topic on this device, without a context", async () => {
    const { ctx } = harness();

    const result = await proposeSetup(ctx, { kind: "topic", title: "Rust async" });

    expect(result.ok && result.value.kind === "topic" && result.value.focus[0]).toBe("Rust async: релизы");
  });

  it("asks the server with the topic the card goes under", async () => {
    const { asked, jobs } = recording();
    const { ctx, topicId: rust } = withTopic({ jobs });

    const result = await proposeSetup(ctx, { kind: "skill", title: "Async", topicId: rust });

    expect(asked[0]).toMatchObject({ kind: "skill", title: "Async", language: "en" });
    expect(asked[0]?.context?.topic.title).toBe("Rust");
    expect(result.ok && result.value).toMatchObject({ kind: "skill", weeks: 3 });
  });

  it("gives a new top-level topic the default language", async () => {
    const { asked, jobs } = recording();
    const { ctx } = harness({ jobs });

    await proposeSetup(ctx, { kind: "topic", title: "Rust" });

    expect(asked[0]).toEqual({ kind: "topic", title: "Rust", language: "ru" });
  });

  it("asks for nothing when the name is blank", async () => {
    const { asked, jobs } = recording();
    const { ctx } = harness({ jobs });

    const result = await proposeSetup(ctx, { kind: "topic", title: "   " });

    expect(result.ok).toBe(false);
    expect(asked).toHaveLength(0);
  });

  it("refuses a topic that is gone", async () => {
    const { ctx } = harness();

    const result = await proposeSetup(ctx, { kind: "skill", title: "x", topicId: topicId("missing") });

    expect(result.ok).toBe(false);
  });

  it("passes a failure on with its message", async () => {
    const gateway: Pick<JobsGateway, "setup"> = { setup: async () => err(appError("auth", "No key")) };
    const { ctx } = harness({ jobs: gateway as JobsGateway });
    const failed = await proposeSetup(ctx, { kind: "topic", title: "Rust" });
    expect(failed.ok ? "" : failed.error.message).toBe("No key");

    const offline = await proposeSetup(harness({ provider: failingProvider() }).ctx, { kind: "topic", title: "Rust" });
    expect(offline.ok ? "" : offline.error.message).toBe("нет сети");
  });
});

describe("latestOnly — an answer for a name typed over since is dropped", () => {
  it("hands back only the answer to the latest call", async () => {
    const pending: Array<(value: string) => void> = [];
    const ask = latestOnly((name: string) => new Promise<string>((resolve) => pending.push(() => resolve(name))));

    const first = ask("Rust");
    const second = ask("Zig");
    pending.forEach((resolve) => resolve(""));

    expect(await first).toBeUndefined();
    expect(await second).toBe("Zig");
  });
});
