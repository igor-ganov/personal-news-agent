import { ok } from "@pna/core";
import { describe, expect, it } from "vitest";
import type { GeneratorCredentials, JobsGateway } from "../ports/jobs.js";
import { harness } from "../testing/harness.js";
import { shareApiKey } from "./settings.js";

const serverWith = (initial: GeneratorCredentials) => {
  let credentials = initial;
  const uploads: string[] = [];
  const gateway: JobsGateway = {
    list: async () => ok([]),
    submit: async () => ok({ id: "j", key: "k", kind: "lesson", status: "queued", meta: null, result: null, error: null }),
    dismiss: async () => ok(true),
    credentials: async () => ok(credentials),
    async setCredentials(apiKey, model) {
      uploads.push(apiKey);
      credentials = { configured: true, ownKey: true, model };
      return ok(credentials);
    },
    suggest: async () => ok([]),
    setup: async () => ok({ kind: "skill", weeks: 1, sessionsPerWeek: 1, minutesPerSession: 15, note: "" }),
  };
  return { gateway, uploads: () => uploads };
};

describe("shareApiKey", () => {
  it("hands the server a key that was saved on this device before signing in", async () => {
    const server = serverWith({ configured: false, ownKey: false, model: "" });
    const h = harness({ jobs: server.gateway });
    await h.ctx.deps.secrets.set("sk-ant-device");

    await shareApiKey(h.ctx);

    expect(server.uploads()).toEqual(["sk-ant-device"]);
  });

  it("does not upload again when the server already holds this account's key", async () => {
    const server = serverWith({ configured: true, ownKey: true, model: "claude-opus-5-5" });
    const h = harness({ jobs: server.gateway });
    await h.ctx.deps.secrets.set("sk-ant-device");

    await shareApiKey(h.ctx);

    expect(server.uploads()).toEqual([]);
  });
});
