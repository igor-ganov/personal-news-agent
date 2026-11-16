import { render } from "lit";
import { describe, expect, it } from "vitest";
import { drawnIcon, type IconName } from "./icons.js";

const NAMES: readonly IconName[] = ["gear", "cross", "back", "next", "open", "closed", "up", "tick", "plus", "minus"];

const drawn = (name: IconName): SVGSVGElement => {
  const host = document.createElement("div");
  render(drawnIcon(name), host);
  return host.querySelector("svg")!;
};

describe("drawnIcon — icons in the app's own hand", () => {
  it.each(NAMES)("draws %s as pen strokes on a 24-unit grid, hidden from screen readers", (name) => {
    const svg = drawn(name);
    expect(svg.getAttribute("data-icon")).toBe(name);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("path")!.getAttribute("d")).toMatch(/^M-?[\d.]+ -?[\d.]+ C/);
  });

  it("draws the same icon the same way every time", () => {
    expect(drawn("gear").innerHTML).toBe(drawn("gear").innerHTML);
  });

  it("keeps every stroke on the grid", () => {
    NAMES.forEach((name) =>
      (drawn(name).querySelector("path")!.getAttribute("d")!.match(/-?\d+(\.\d+)?/g) ?? [])
        .map(Number)
        .forEach((n) => {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(24);
        }),
    );
  });
});
