import { describe, expect, it } from "vitest";
import type { LessonDraft, ProgramDraft } from "../model/skill.js";
import { applyPlanEdit, applyPlanEdits, draftLessonMinutes, type PlanEdit } from "./plan-edit.js";

const lesson = (title: string, minutes = 45): LessonDraft => ({
  title,
  objective: `Цель: ${title}`,
  estimatedMinutes: minutes,
});

const draft: ProgramDraft = {
  title: "Основы инференса",
  goal: "Понять, как гонять модели на своём железе",
  rationale: "Отталкиваемся от текущего уровня",
  modules: [
    { title: "Модуль А", objective: "Цель А", lessons: [lesson("A1"), lesson("A2")] },
    { title: "Модуль Б", objective: "Цель Б", lessons: [lesson("B1")] },
  ],
};

const apply = (edit: PlanEdit) => {
  const result = applyPlanEdit(draft, edit);
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.value;
};

const titles = (d: ProgramDraft) => d.modules.map((m) => m.title);
const lessonTitles = (d: ProgramDraft) => d.modules.map((m) => m.lessons.map((l) => l.title));

describe("applyPlanEdit — program fields", () => {
  it("renames the program", () => {
    expect(apply({ type: "set-title", title: "  Новое имя  " }).title).toBe("Новое имя");
  });

  it("refuses a blank program title", () => {
    expect(applyPlanEdit(draft, { type: "set-title", title: " " })).toEqual({
      ok: false,
      error: "empty-title",
    });
  });

  it("rewrites the goal", () => {
    expect(apply({ type: "set-goal", goal: " новая цель " }).goal).toBe("новая цель");
  });

  it("never mutates the input draft", () => {
    apply({ type: "set-title", title: "Другое" });
    expect(draft.title).toBe("Основы инференса");
  });
});

describe("applyPlanEdit — modules", () => {
  it("appends a module by default", () => {
    const next = apply({
      type: "add-module",
      module: { title: "Модуль В", objective: "Цель В", lessons: [] },
    });
    expect(titles(next)).toEqual(["Модуль А", "Модуль Б", "Модуль В"]);
  });

  it("inserts a module at a position", () => {
    const next = apply({
      type: "add-module",
      module: { title: "Модуль 0", objective: "", lessons: [] },
      at: 0,
    });
    expect(titles(next)).toEqual(["Модуль 0", "Модуль А", "Модуль Б"]);
  });

  it("removes a module", () => {
    expect(titles(apply({ type: "remove-module", module: 0 }))).toEqual(["Модуль Б"]);
  });

  it("refuses to remove the last module", () => {
    const single: ProgramDraft = { ...draft, modules: [draft.modules[0]!] };
    expect(applyPlanEdit(single, { type: "remove-module", module: 0 })).toEqual({
      ok: false,
      error: "empty-plan",
    });
  });

  it("reorders modules", () => {
    expect(titles(apply({ type: "move-module", from: 1, to: 0 }))).toEqual(["Модуль Б", "Модуль А"]);
  });

  it("clamps an out-of-bounds move target instead of failing", () => {
    expect(titles(apply({ type: "move-module", from: 0, to: 99 }))).toEqual(["Модуль Б", "Модуль А"]);
  });

  it("patches a module", () => {
    const next = apply({ type: "edit-module", module: 1, patch: { objective: " новая цель " } });
    expect(next.modules[1]).toMatchObject({ title: "Модуль Б", objective: "новая цель" });
  });

  it("reports out-of-range module indexes", () => {
    expect(applyPlanEdit(draft, { type: "remove-module", module: 5 })).toEqual({
      ok: false,
      error: "out-of-range",
    });
    expect(applyPlanEdit(draft, { type: "edit-module", module: -1, patch: {} })).toEqual({
      ok: false,
      error: "out-of-range",
    });
  });
});

describe("applyPlanEdit — lessons", () => {
  it("adds a lesson to a module", () => {
    expect(lessonTitles(apply({ type: "add-lesson", module: 1, lesson: lesson("B2") }))).toEqual([
      ["A1", "A2"],
      ["B1", "B2"],
    ]);
  });

  it("removes a lesson", () => {
    expect(lessonTitles(apply({ type: "remove-lesson", module: 0, lesson: 0 }))).toEqual([
      ["A2"],
      ["B1"],
    ]);
  });

  it("allows emptying a module of lessons", () => {
    const next = apply({ type: "remove-lesson", module: 1, lesson: 0 });
    expect(next.modules[1]!.lessons).toEqual([]);
  });

  it("patches a lesson's minutes without touching its title", () => {
    const next = apply({ type: "edit-lesson", module: 0, lesson: 1, patch: { estimatedMinutes: 90 } });
    expect(next.modules[0]!.lessons[1]).toMatchObject({ title: "A2", estimatedMinutes: 90 });
  });

  it("reorders lessons inside a module", () => {
    expect(
      lessonTitles(apply({ type: "move-lesson", from: { module: 0, lesson: 1 }, to: { module: 0, lesson: 0 } })),
    ).toEqual([["A2", "A1"], ["B1"]]);
  });

  it("moves a lesson to another module", () => {
    expect(
      lessonTitles(apply({ type: "move-lesson", from: { module: 0, lesson: 0 }, to: { module: 1, lesson: 0 } })),
    ).toEqual([["A2"], ["A1", "B1"]]);
  });

  it("reports out-of-range lesson indexes", () => {
    expect(applyPlanEdit(draft, { type: "remove-lesson", module: 0, lesson: 9 })).toEqual({
      ok: false,
      error: "out-of-range",
    });
    expect(
      applyPlanEdit(draft, { type: "move-lesson", from: { module: 3, lesson: 0 }, to: { module: 0, lesson: 0 } }),
    ).toEqual({ ok: false, error: "out-of-range" });
  });
});

describe("applyPlanEdits", () => {
  it("threads edits through in order", () => {
    const result = applyPlanEdits(draft, [
      { type: "set-title", title: "Итог" },
      { type: "move-module", from: 1, to: 0 },
      { type: "add-lesson", module: 0, lesson: lesson("B0"), at: 0 },
    ]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.title).toBe("Итог");
    expect(lessonTitles(result.value)).toEqual([["B0", "B1"], ["A1", "A2"]]);
  });

  it("stops at the first failing edit", () => {
    expect(
      applyPlanEdits(draft, [
        { type: "set-goal", goal: "ок" },
        { type: "remove-module", module: 42 },
        { type: "set-title", title: "не дойдёт" },
      ]),
    ).toEqual({ ok: false, error: "out-of-range" });
  });
});

describe("draftLessonMinutes", () => {
  it("flattens lesson lengths in plan order", () => {
    expect(draftLessonMinutes(draft)).toEqual([45, 45, 45]);
  });
});
