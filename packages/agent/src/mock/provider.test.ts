import { describe, expect, it } from "vitest";
import { T0, testContext, testLesson } from "../testing/fixtures.js";
import { createMockProvider } from "./provider.js";

const provider = createMockProvider();
const context = testContext();

describe("MockContentProvider", () => {
  it("is deterministic", async () => {
    const input = { context, known: [], blockedHosts: [], limit: 5, now: T0 };
    expect(await provider.discoverSources(input)).toEqual(await provider.discoverSources(input));
  });

  it("proposes one source per focus area plus an overview, within the limit", async () => {
    const result = await provider.discoverSources({
      context,
      known: [],
      blockedHosts: [],
      limit: 2,
      now: T0,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toHaveLength(2);
  });

  it("respects the blacklist", async () => {
    const unfiltered = await provider.discoverSources({
      context,
      known: [],
      blockedHosts: [],
      limit: 5,
      now: T0,
    });
    if (!unfiltered.ok) throw new Error("expected ok");
    const blockedHost = new URL(unfiltered.value[0]!.url).hostname;

    const filtered = await provider.discoverSources({
      context,
      known: [],
      blockedHosts: [blockedHost],
      limit: 5,
      now: T0,
    });
    if (!filtered.ok) throw new Error("expected ok");
    expect(filtered.value.map((s) => new URL(s.url).hostname)).not.toContain(blockedHost);
  });

  it("does not propose sources the user already has", async () => {
    const unfiltered = await provider.discoverSources({
      context,
      known: [],
      blockedHosts: [],
      limit: 5,
      now: T0,
    });
    if (!unfiltered.ok) throw new Error("expected ok");
    const first = unfiltered.value[0]!;
    const url = new URL(first.url);

    const filtered = await provider.discoverSources({
      context,
      known: [
        {
          id: "s1" as never,
          topicId: context.topic.id,
          title: first.title,
          url: first.url,
          key: `${url.hostname}${url.pathname}`,
          kind: first.kind,
          origin: "user",
          status: "active",
          rationale: "",
          addedAt: T0,
          lastConfirmedAt: null,
        },
      ],
      blockedHosts: [],
      limit: 5,
      now: T0,
    });
    if (!filtered.ok) throw new Error("expected ok");
    expect(filtered.value.map((s) => s.url)).not.toContain(first.url);
  });

  it("never plans more sessions than the intensity allows", async () => {
    const result = await provider.draftProgram({
      context,
      intent: "",
      weeks: 2,
      sessionsPerWeek: 2,
      minutesPerSession: 30,
      priorMaterial: [],
      continuation: "fresh",
      now: T0,
    });
    if (!result.ok) throw new Error("expected ok");
    const lessons = result.value.modules.flatMap((m) => m.lessons);
    expect(lessons.length).toBeLessThanOrEqual(4);
    expect(lessons.every((l) => l.estimatedMinutes === 30)).toBe(true);
  });

  it("produces a lecture with a renderable diagram", async () => {
    const result = await provider.writeLesson({
      context,
      programTitle: "П",
      programGoal: "Ц",
      moduleTitle: "М",
      lesson: testLesson(),
      coveredInProgram: [],
      priorMaterial: [],
      blockedHosts: [],
      now: T0,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.body).toContain("# Квантизация");
    expect(result.value.diagrams[0]!.mermaid).toContain("graph TD");
  });

  it("produces a gradable quiz", async () => {
    const result = await provider.buildQuiz({
      context,
      lesson: testLesson(),
      lessonBody: "тело",
      keyPoints: [],
      questionCount: 3,
      now: T0,
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.questions).toHaveLength(3);
    expect(result.value.questions[0]!.correctOptionIds).toEqual(["a"]);
  });
});
