import { afterEach, describe, expect, it } from "vitest";
import { capture, mount, query, unmountAll } from "../testing/dom.js";
import { UiCheck } from "./ui-check.js";

afterEach(unmountAll);

const render = async (checked: boolean) => {
  const element = new UiCheck();
  element.label = "Пополнять список автоматически";
  element.checked = checked;
  return mount(element);
};

describe("ui-check — a box ticked by hand", () => {
  it("is a real checkbox named by its label, for screen readers and taps alike", async () => {
    const element = await render(false);
    const input = query<HTMLInputElement>(element, "input[type=checkbox]")!;
    expect(input.checked).toBe(false);
    expect(query(element, "label")!.textContent).toContain("Пополнять список автоматически");
  });

  it("draws the tick only when checked", async () => {
    expect(query(await render(true), "svg[data-icon='tick']")).not.toBeNull();
    unmountAll();
    expect(query(await render(false), "svg[data-icon='tick']")).toBeNull();
  });

  it("announces the new state when tapped", async () => {
    const element = await render(false);
    const events = capture<boolean>(element, "check-change");
    query<HTMLInputElement>(element, "input")!.click();
    await element.updateComplete;
    expect(events).toEqual([true]);
  });
});
