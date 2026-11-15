import { describe, expect, it } from "vitest";
import { createMockProvider } from "../mock/provider.js";
import { testContext } from "../testing/fixtures.js";
import { setupPrompt, setupSystem, SETUP_TOOL } from "./setup.js";

const context = testContext();

describe("setup prompts — settings from a typed name", () => {
  it("asks for a whole topic card and names the tool", () => {
    const prompt = setupPrompt({ kind: "topic", title: "Rust async", context, language: "ru" });
    expect(prompt).toContain("NAME TYPED BY THE USER: Rust async");
    expect(prompt).toContain(`CURRENT TOPIC: ${context.topic.title}`);
    expect(prompt).toMatch(/excludes:/);
    expect(setupSystem()).toContain(SETUP_TOOL);
  });

  it("gives a top-level topic its language instead of a context", () => {
    const prompt = setupPrompt({ kind: "topic", title: "Rust async", language: "en" });
    expect(prompt).toContain("OUTPUT LANGUAGE: en");
    expect(prompt).not.toContain("CURRENT TOPIC");
  });

  it("asks a skill for a time budget inside the wizard's ranges", () => {
    const prompt = setupPrompt({ kind: "skill", title: "Async in Rust", context, language: "ru" });
    expect(prompt).toContain("weeks: 1–26");
    expect(prompt).toContain("minutesPerSession: 15–120");
  });
});

describe("mock setup — offline settings that follow the name", () => {
  it("names the title in a topic's settings", async () => {
    const answer = await createMockProvider().proposeSetup({ kind: "topic", title: "Rust", language: "ru" });
    expect(answer.ok && answer.value.kind === "topic" && answer.value.focus[0]).toBe("Rust: релизы");
  });

  it("proposes a time budget for a skill", async () => {
    const answer = await createMockProvider().proposeSetup({ kind: "skill", title: "Rust", context, language: "ru" });
    expect(answer.ok && answer.value).toMatchObject({ kind: "skill", weeks: 6, sessionsPerWeek: 2, minutesPerSession: 60 });
  });
});
