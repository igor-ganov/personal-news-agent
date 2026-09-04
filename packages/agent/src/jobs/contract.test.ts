import { describe, expect, it } from "vitest";
import { createMockProvider } from "../mock/provider.js";
import { T0, testContext, testLesson } from "../testing/fixtures.js";
import { AGENT_JOB_KINDS, isAgentJobKind, runAgentJob, type AgentJobRequest } from "./contract.js";

const context = testContext();

const requestOf = (kind: (typeof AGENT_JOB_KINDS)[number]): AgentJobRequest => {
  switch (kind) {
    case "sources":
      return { kind, input: { context, known: [], blockedHosts: [], limit: 3, now: T0 } };
    case "digest":
      return {
        kind,
        input: {
          context,
          period: "week",
          window: { from: T0, to: T0 },
          sources: [],
          blockedHosts: [],
          now: T0,
        },
      };
    case "program":
      return {
        kind,
        input: {
          context,
          intent: "get the basics",
          weeks: 2,
          sessionsPerWeek: 2,
          minutesPerSession: 45,
          priorMaterial: [],
          continuation: "fresh",
          now: T0,
        },
      };
    case "lesson":
      return {
        kind,
        input: {
          context,
          programTitle: "Program",
          programGoal: "goal",
          moduleTitle: "Module",
          lesson: testLesson(),
          coveredInProgram: [],
          priorMaterial: [],
          blockedHosts: [],
          now: T0,
        },
      };
    case "quiz":
      return {
        kind,
        input: {
          context,
          lesson: testLesson(),
          lessonBody: "body",
          keyPoints: [],
          questionCount: 3,
          now: T0,
        },
      };
  }
};

describe("agent job contract", () => {
  it("recognises only the known kinds", () => {
    expect(AGENT_JOB_KINDS.every(isAgentJobKind)).toBe(true);
    expect(isAgentJobKind("lecture")).toBe(false);
    expect(isAgentJobKind(undefined)).toBe(false);
  });

  it("routes every kind to a provider call that answers", async () => {
    const provider = createMockProvider();

    for (const kind of AGENT_JOB_KINDS) {
      const result = await runAgentJob(provider, requestOf(kind));
      expect(result.ok, kind).toBe(true);
    }
  });
});
