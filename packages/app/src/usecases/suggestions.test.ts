import type { SuggestInput } from "@pna/agent";
import { err, ok, type Suggestion } from "@pna/core";
import { describe, expect, it } from "vitest";
import { appError } from "../errors.js";
import type { JobsGateway } from "../ports/jobs.js";
import { failingProvider, harness } from "../testing/harness.js";
import { suggestIdeas } from "./suggestions.js";
import { addTopic } from "./topics.js";

const withTopic = (options: Parameters<typeof harness>[0] = {}) => {
  const h = harness(options);
  const created = addTopic(h.ctx, { parentId: null, title: "Rust" });
  if (!created.ok) throw new Error("expected ok");
  return { ...h, topicId: created.value.id };
};

const titles = (ideas: readonly Suggestion[]): string[] => ideas.map((idea) => idea.title);

describe("suggestIdeas — ideas to start a card from", () => {
  it("brings ten ideas for a subtopic", async () => {
    const { ctx, topicId } = withTopic();

    const result = await suggestIdeas(ctx, { kind: "subtopic", topicId, shown: [] });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.value).toHaveLength(10);
    expect(result.value[0]?.title).toBe("Подтема 1: Rust");
  });

  it("«ещё» adds ten new ones after those shown", async () => {
    const { ctx, topicId } = withTopic();
    const first = await suggestIdeas(ctx, { kind: "skill", topicId, shown: [] });
    if (!first.ok) throw new Error("expected ok");

    const more = await suggestIdeas(ctx, { kind: "skill", topicId, shown: first.value });

    if (!more.ok) throw new Error("expected ok");
    expect(more.value).toHaveLength(20);
    expect(new Set(titles(more.value)).size).toBe(20);
    expect(titles(more.value).slice(0, 10)).toEqual(titles(first.value));
  });

  it("never offers a subtopic the topic already has", async () => {
    const { ctx, topicId } = withTopic();
    addTopic(ctx, { parentId: topicId, title: "Подтема 1: Rust" });

    const result = await suggestIdeas(ctx, { kind: "subtopic", topicId, shown: [] });

    if (!result.ok) throw new Error("expected ok");
    expect(titles(result.value)).not.toContain("Подтема 1: Rust");
  });

  it("asks the server when there is one, telling it what not to repeat", async () => {
    const asked: SuggestInput[] = [];
    const gateway: Pick<JobsGateway, "suggest"> = {
      suggest: async (request) => {
        asked.push(request);
        return ok([{ title: "С сервера", summary: "", brief: "", focus: [] }]);
      },
    };
    const { ctx, topicId } = withTopic({ jobs: gateway as JobsGateway });
    const shown: Suggestion[] = [{ title: "Уже на экране", summary: "", brief: "", focus: [] }];

    const result = await suggestIdeas(ctx, { kind: "skill", topicId, shown });

    expect(asked[0]).toMatchObject({ kind: "skill", count: 10, exclude: ["Уже на экране"] });
    expect(asked[0]?.context.topic.title).toBe("Rust");
    expect(result.ok && titles(result.value)).toEqual(["Уже на экране", "С сервера"]);
  });

  it("passes a failure on with its message", async () => {
    const gateway: Pick<JobsGateway, "suggest"> = {
      suggest: async () => err(appError("auth", "Нет ключа")),
    };
    const { ctx, topicId } = withTopic({ jobs: gateway as JobsGateway });

    const result = await suggestIdeas(ctx, { kind: "skill", topicId, shown: [] });

    expect(result.ok ? "" : result.error.message).toBe("Нет ключа");
  });

  it("reports a provider failure on this device", async () => {
    const { ctx, topicId } = withTopic({ provider: failingProvider() });

    const result = await suggestIdeas(ctx, { kind: "subtopic", topicId, shown: [] });

    expect(result.ok ? "" : result.error.message).toBe("нет сети");
  });
});
