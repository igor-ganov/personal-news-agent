import { applyPlanEdit, capacityReport, draftLessonMinutes, type PlanEdit, type ProgramDraft } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, unmountAll } from "../testing/dom.js";
import { PnaPlanEditor } from "./pna-plan-editor.js";

const lesson = (title: string) => ({ title, objective: `Цель ${title}`, estimatedMinutes: 45 });

const draft: ProgramDraft = {
  title: "Локальный инференс",
  goal: "30B на ноутбуке",
  rationale: "почему так",
  modules: [
    { title: "Модуль А", objective: "Цель А", lessons: [lesson("A1"), lesson("A2")] },
    { title: "Модуль Б", objective: "Цель Б", lessons: [lesson("B1")] },
  ],
};

const render = async (over: Partial<PnaPlanEditor> = {}) => {
  const element = new PnaPlanEditor();
  element.draft = draft;
  Object.assign(element, over);
  return mount(element);
};

afterEach(unmountAll);

describe("pna-plan-editor", () => {
  it("renders every module and lesson", async () => {
    const element = await render();
    expect(queryAll(element, ".module")).toHaveLength(2);
    expect(queryAll(element, ".lesson")).toHaveLength(3);
  });

  it("emits a remove-module edit", async () => {
    const element = await render();
    const events = capture<PlanEdit>(element, "plan-edit");
    await click(element, queryAll(element, ".module")[0]!.querySelectorAll(".icon")[1] ?? null);
    expect(events).toEqual([{ type: "remove-module", module: 0 }]);
  });

  it("emits a move-lesson edit that the domain can apply", async () => {
    const element = await render();
    const events = capture<PlanEdit>(element, "plan-edit");
    await click(element, queryAll(element, ".lesson")[1]!.querySelectorAll(".icon")[0] ?? null);

    expect(events).toEqual([
      { type: "move-lesson", from: { module: 0, lesson: 1 }, to: { module: 0, lesson: 0 } },
    ]);

    const applied = applyPlanEdit(draft, events[0]!);
    if (!applied.ok) throw new Error("expected ok");
    expect(applied.value.modules[0]!.lessons.map((l) => l.title)).toEqual(["A2", "A1"]);
  });

  it("disables moving the first item up", async () => {
    const element = await render();
    const firstUp = queryAll(element, ".lesson")[0]!.querySelectorAll(".icon")[0] as HTMLButtonElement;
    expect(firstUp.disabled).toBe(true);
  });

  it("emits a title edit as the user types", async () => {
    const element = await render();
    const events = capture<PlanEdit>(element, "plan-edit");
    query(element, "ui-field")!.dispatchEvent(
      new CustomEvent("field-input", { detail: "Другое имя", bubbles: true, composed: true }),
    );
    expect(events).toContainEqual({ type: "set-title", title: "Другое имя" });
  });

  it("warns when the plan does not fit the chosen intensity", async () => {
    const element = await render({
      capacity: capacityReport(
        { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 },
        draftLessonMinutes(draft),
      ),
    });
    expect(query(element, 'ui-notice[tone="info"]')?.getAttribute("message")).toContain(
      "План длиннее выбранного срока",
    );
  });

  it("stays quiet when the plan fits", async () => {
    const element = await render({
      capacity: capacityReport(
        { weeks: 4, sessionsPerWeek: 3, minutesPerSession: 45 },
        draftLessonMinutes(draft),
      ),
    });
    expect(query(element, 'ui-notice[tone="info"]')).toBeNull();
  });

  it("commits and discards", async () => {
    const element = await render();
    const commit = capture(element, "plan-commit");
    const discard = capture(element, "plan-discard");

    const actions = queryAll(element, ".actions ui-button");
    await click(element, actions[1] ?? null);
    await click(element, actions[0] ?? null);

    expect(commit).toHaveLength(1);
    expect(discard).toHaveLength(1);
  });
});
