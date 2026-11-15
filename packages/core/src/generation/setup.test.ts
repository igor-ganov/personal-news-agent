import { describe, expect, it } from "vitest";
import { WIZARD_INTENSITY, readSetup } from "./setup.js";

describe("readSetup — settings proposed for a card from its title", () => {
  it("reads a topic's settings and trims them", () => {
    expect(
      readSetup("topic", {
        brief: " Following releases ",
        level: "advanced",
        focus: [" Releases ", "", 4],
        excludes: ["Rumours", " "],
      }),
    ).toEqual({
      kind: "topic",
      brief: "Following releases",
      level: "advanced",
      focus: ["Releases"],
      excludes: ["Rumours"],
    });
  });

  it("falls back to the middle level when the model names none it knows", () => {
    const setup = readSetup("topic", { brief: "b", level: "expert", focus: [], excludes: [] });
    expect(setup?.kind === "topic" && setup.level).toBe("intermediate");
  });

  it("reads a skill's time budget and keeps it inside what the wizard can show", () => {
    expect(
      readSetup("skill", { weeks: 60, sessionsPerWeek: 0, minutesPerSession: 47.6, note: " Why this budget " }),
    ).toEqual({
      kind: "skill",
      weeks: WIZARD_INTENSITY.weeks.max,
      sessionsPerWeek: WIZARD_INTENSITY.sessionsPerWeek.min,
      minutesPerSession: 48,
      note: "Why this budget",
    });
  });

  it("refuses an answer that is not an object or has no usable numbers", () => {
    expect(readSetup("topic", "x")).toBeUndefined();
    expect(readSetup("skill", { weeks: "four" })).toBeUndefined();
  });
});
