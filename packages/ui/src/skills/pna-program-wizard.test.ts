import { calendarDay } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmountAll } from "../testing/dom.js";
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
