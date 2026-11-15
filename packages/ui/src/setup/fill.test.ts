import { describe, expect, it } from "vitest";
import { fillUntouched, touch } from "./fill.js";

describe("fillUntouched — a proposal never overwrites the user's own input", () => {
  const value = { title: "Rust", brief: "", level: "intermediate" };

  it("fills every listed field the user has not touched", () => {
    expect(fillUntouched(["brief", "level"], value, { brief: "b", level: "advanced" }, new Set())).toEqual({
      title: "Rust",
      brief: "b",
      level: "advanced",
    });
  });

  it("keeps a touched field as the user left it", () => {
    const mine = { ...value, brief: "mine" };
    expect(fillUntouched(["brief", "level"], mine, { brief: "b", level: "advanced" }, touch(new Set(), "brief"))).toEqual({
      title: "Rust",
      brief: "mine",
      level: "advanced",
    });
  });
});
