import { describe, expect, it } from "vitest";
import type { LessonId, ModuleId, ProgramId } from "../model/ids.js";
import { makeLessonPlan, makeModule, makeProgram } from "../testing/builders.js";
import { canBaseOn, dependentsOf, lineageOf, priorMaterialOf, type ProgramMap } from "./lineage.js";

const pid = (s: string) => s as ProgramId;

const program = (id: string, basedOn: string[], lessonTitles: string[] = []) =>
  makeProgram({
    id: pid(id),
    title: `Программа ${id}`,
    basedOn: basedOn.map(pid),
    modules: [
      makeModule({
        id: `${id}_m` as ModuleId,
        lessons: lessonTitles.map((title, i) =>
          makeLessonPlan({
            id: `${id}_l${i}` as LessonId,
            moduleId: `${id}_m` as ModuleId,
            order: i,
            title,
            status: i === 0 ? "done" : "planned",
          }),
        ),
      }),
    ],
  });

// basics ← intermediate ← advanced, plus a side program built on basics.
const programs: ProgramMap = Object.fromEntries(
  [
    program("basics", [], ["Что такое инференс"]),
    program("intermediate", ["basics"], ["Квантизация", "KV-cache"]),
    program("advanced", ["intermediate"], ["Спекулятивное декодирование"]),
    program("side", ["basics"], ["Промпт-инжиниринг"]),
  ].map((p) => [p.id, p]),
);

describe("lineageOf", () => {
  it("returns nothing for a standalone program", () => {
    expect(lineageOf(programs, pid("basics"))).toEqual([]);
  });

  it("walks the chain foundation-first", () => {
    expect(lineageOf(programs, pid("advanced")).map((p) => p.id)).toEqual([
      "basics",
      "intermediate",
    ]);
  });

  it("de-duplicates a diamond", () => {
    const diamond: ProgramMap = {
      ...programs,
      [pid("merge")]: program("merge", ["intermediate", "side"]),
    };
    expect(lineageOf(diamond, pid("merge")).map((p) => p.id)).toEqual([
      "basics",
      "intermediate",
      "side",
    ]);
  });

  it("survives a cycle instead of looping forever", () => {
    const cyclic: ProgramMap = {
      [pid("a")]: program("a", ["b"]),
      [pid("b")]: program("b", ["a"]),
    };
    expect(lineageOf(cyclic, pid("a")).map((p) => p.id)).toEqual(["b"]);
  });

  it("ignores a dangling reference", () => {
    const dangling: ProgramMap = { [pid("x")]: program("x", ["ghost"]) };
    expect(lineageOf(dangling, pid("x"))).toEqual([]);
  });
});

describe("dependentsOf", () => {
  it("finds the programs built directly on top", () => {
    expect(dependentsOf(programs, pid("basics")).map((p) => p.id)).toEqual([
      "intermediate",
      "side",
    ]);
    expect(dependentsOf(programs, pid("advanced"))).toEqual([]);
  });
});

describe("canBaseOn", () => {
  it("allows an unrelated foundation", () => {
    expect(canBaseOn(programs, pid("side"), pid("intermediate"))).toBe(true);
  });

  it("refuses self-reference and unknown programs", () => {
    expect(canBaseOn(programs, pid("side"), pid("side"))).toBe(false);
    expect(canBaseOn(programs, pid("side"), pid("ghost"))).toBe(false);
  });

  it("refuses a foundation that already depends on the program", () => {
    expect(canBaseOn(programs, pid("basics"), pid("advanced"))).toBe(false);
    expect(canBaseOn(programs, pid("intermediate"), pid("advanced"))).toBe(false);
  });
});

describe("priorMaterialOf", () => {
  it("flattens upstream lessons in study order", () => {
    expect(priorMaterialOf(programs, pid("advanced")).map((m) => m.lessonTitle)).toEqual([
      "Что такое инференс",
      "Квантизация",
      "KV-cache",
    ]);
  });

  it("marks which upstream lessons were actually completed", () => {
    const material = priorMaterialOf(programs, pid("advanced"));
    expect(material.map((m) => m.covered)).toEqual([true, true, false]);
    expect(material[0]).toMatchObject({ programId: "basics", programTitle: "Программа basics" });
  });
});
