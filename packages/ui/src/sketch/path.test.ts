import { describe, expect, it } from "vitest";
import { sketchFrame, sketchLine, sketchOval } from "./path.js";

const numbers = (d: string): readonly number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("sketchLine — a straight line as a hand would draw it", () => {
  it("is one cubic stroke from start to end", () => {
    expect(sketchLine({ seed: 1, wobble: 0 })(0, 3, 100, 3)).toBe("M0.0 3.0 C33.3 3.0 66.7 3.0 100.0 3.0");
  });

  it("wobbles the same way for the same seed, so a redraw does not flicker", () => {
    const draw = (): string => sketchLine({ seed: 7, wobble: 1.4 })(0, 3, 354, 3);
    expect(draw()).toBe(draw());
  });

  it("wobbles differently for another seed", () => {
    expect(sketchLine({ seed: 7, wobble: 1.4 })(0, 3, 354, 3)).not.toBe(
      sketchLine({ seed: 8, wobble: 1.4 })(0, 3, 354, 3),
    );
  });

  it("strays from the ruler by no more than the wobble", () => {
    const ys = numbers(sketchLine({ seed: 3, wobble: 1.5 })(0, 10, 300, 10)).filter((_, i) => i % 2 === 1);
    ys.forEach((y) => expect(Math.abs(y - 10)).toBeLessThanOrEqual(1.5));
  });
});

describe("sketchFrame — a rectangle drawn in four strokes", () => {
  it("draws four separate strokes", () => {
    expect(sketchFrame({ seed: 2, wobble: 1 })(354, 104).match(/M/g)).toHaveLength(4);
  });

  it("stays inside the box it frames", () => {
    numbers(sketchFrame({ seed: 2, wobble: 1.4 })(354, 104)).forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(354);
    });
  });
});

describe("sketchOval — a loop drawn around a word", () => {
  it("is one closed-looking stroke that overshoots its start", () => {
    const d = sketchOval({ seed: 4, wobble: 1.5 })(80, 30);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/C/g)).toHaveLength(5);
  });

  it("stays inside the box it circles", () => {
    numbers(sketchOval({ seed: 4, wobble: 1.5 })(80, 30)).forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(80);
    });
  });
});
