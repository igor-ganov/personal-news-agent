import { calendarDay } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, mount, query, unmountAll } from "../testing/dom.js";
import { PnaProgramWizard, type ProgramRequest } from "./pna-program-wizard.js";

afterEach(unmountAll);

const request = (intent: string): ProgramRequest => ({
  intent,
  schedule: {
    startDay: calendarDay("2026-08-22"),
    intensity: { weeks: 6, sessionsPerWeek: 2, minutesPerSession: 60 },
  },
  basedOn: [],
  continuation: "deepen",
});

const intentField = (element: PnaProgramWizard) =>
  query<HTMLElement & { value: string }>(element, "ui-field");

describe("pna-program-wizard prefill", () => {
  it("starts from the request a failed or running plan was made with", async () => {
    const element = new PnaProgramWizard();
    element.initial = request("разобраться в инференсе");
    await mount(element);

    expect(intentField(element)?.value).toBe("разобраться в инференсе");
  });

  it("does not undo the user's typing when the same request is passed again", async () => {
    const element = new PnaProgramWizard();
    element.initial = request("разобраться");
    await mount(element);

    intentField(element)?.dispatchEvent(
      new CustomEvent("field-input", { detail: "своё", bubbles: true, composed: true }),
    );
    element.initial = request("разобраться");
    await element.updateComplete;

    expect(intentField(element)?.value).toBe("своё");
  });
});

describe("pna-program-wizard ideas", () => {
  it("a picked idea fills in what the program should achieve, and it stays editable", async () => {
    const element = new PnaProgramWizard();
    const idea = {
      title: "Профилировать async",
      summary: "",
      brief: "Находить, где тормозит рантайм",
      focus: [],
    };
    element.ideas = [idea];
    await mount(element);

    query<HTMLElement>(element, "pna-suggestions")?.dispatchEvent(
      new CustomEvent("suggestion-pick", { detail: idea, bubbles: true, composed: true }),
    );
    await element.updateComplete;

    expect(intentField(element)?.value).toBe("Профилировать async: Находить, где тормозит рантайм");
  });
});

const pace = { kind: "skill" as const, weeks: 8, sessionsPerWeek: 2, minutesPerSession: 60, note: "Eight weeks fit" };

const slider = (element: PnaProgramWizard, label: string) =>
  query<HTMLInputElement>(element, `input[aria-label="${label}"]`);

describe("pna-program-wizard time budget from the goal", () => {
  it("asks for a budget when the goal is committed or an idea is picked", async () => {
    const element = new PnaProgramWizard();
    await mount(element);
    const asked = capture<string>(element, "setup-request");

    intentField(element)?.dispatchEvent(new CustomEvent("field-change", { detail: " Rust ", bubbles: true, composed: true }));
    query<HTMLElement>(element, "pna-suggestions")?.dispatchEvent(
      new CustomEvent("suggestion-pick", {
        detail: { title: "Zig", summary: "", brief: "", focus: [] },
        bubbles: true,
        composed: true,
      }),
    );

    expect(asked).toEqual(["Rust", "Zig"]);
  });

  it("moves the sliders the user has not moved, and shows why", async () => {
    const element = new PnaProgramWizard();
    await mount(element);
    const minutes = slider(element, "Минут за раз");
    if (minutes) minutes.value = "30";
    minutes?.dispatchEvent(new Event("input"));

    element.setup = pace;
    await element.updateComplete;

    expect(slider(element, "Длительность")?.value).toBe("8");
    expect(slider(element, "Занятий в неделю")?.value).toBe("2");
    expect(slider(element, "Минут за раз")?.value).toBe("30");
    expect(query(element, "[role=status]")?.textContent).toContain("Eight weeks fit");
  });

  it("keeps the budget of a request it was reopened with", async () => {
    const element = new PnaProgramWizard();
    element.initial = request("goal");
    await mount(element);

    element.setup = { ...pace, weeks: 12 };
    await element.updateComplete;

    expect(slider(element, "Длительность")?.value).toBe("6");
  });
});
