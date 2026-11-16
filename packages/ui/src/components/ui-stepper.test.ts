import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, queryAll, text, unmountAll } from "../testing/dom.js";
import { UiStepper } from "./ui-stepper.js";

afterEach(unmountAll);

const render = async (value: number) => {
  const element = new UiStepper();
  Object.assign(element, { value, min: 1, max: 60, unit: "дн.", label: "Дней между обновлениями" });
  return mount(element);
};

describe("ui-stepper — a number changed with a finger, not a keyboard", () => {
  it("shows the value with its unit", async () => {
    expect(text(await render(7))).toContain("7 дн.");
  });

  it("steps down and up by one", async () => {
    const element = await render(7);
    const events = capture<number>(element, "stepper-change");
    const [less, more] = queryAll(element, "ui-icon-button");
    await click(element, less!.shadowRoot!.querySelector("button"));
    await click(element, more!.shadowRoot!.querySelector("button"));
    expect(events).toEqual([6, 8]);
  });

  it("cannot step past its bounds", async () => {
    const element = await render(1);
    expect(queryAll(element, "ui-icon-button")[0]!.hasAttribute("disabled")).toBe(true);
  });
});
