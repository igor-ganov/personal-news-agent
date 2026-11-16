import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rules of the look that no single component test would catch: they hold for
 * every screen at once, so they are checked over the sources themselves.
 */
const ROOTS = ["packages/ui/src", "apps/mobile/src"];

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
        ? [join(dir, entry.name)]
        : [],
  );

const offenders = (pattern: RegExp): string[] =>
  ROOTS.flatMap(sources).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  );

describe("the look across every screen", () => {
  // Arrows, crosses, ticks, gears and emoji render in the system font, not in
  // the drawn hand of the app; icons are drawn SVG instead.
  it("uses drawn icons, never Unicode symbols", () => {
    expect(offenders(/[←-⇿⌀-⏿■-➿⬀-⯿×›‹]|\p{Extended_Pictographic}/u)).toEqual([]);
  });

  // Letter-spaced capitals are the stock "eyebrow" of generated interfaces.
  it("never sets labels in spaced capitals", () => {
    expect(offenders(/text-transform:\s*uppercase/)).toEqual([]);
  });
});
