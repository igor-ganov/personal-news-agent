import { afterEach, describe, expect, it } from "vitest";
import { formatElapsed } from "../format/labels.js";
import { mount, query, text, unmountAll } from "../testing/dom.js";
import { UiTaskStatus } from "./ui-task-status.js";

afterEach(unmountAll);

describe("formatElapsed", () => {
  it("reads as minutes and seconds, and grows hours when it has to", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(80_000)).toBe("1:20");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });

  it("never shows a negative time when clocks disagree", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
  });
});

describe("ui-task-status", () => {
  const render = (since: string, hint = "") => {
    const element = new UiTaskStatus();
    element.label = "Ищем источники";
    element.since = since;
    element.hint = hint;
    element.now = () => Date.parse("2026-08-22T10:01:20Z");
    return mount(element);
  };

  it("says what is happening and for how long", async () => {
    const element = await render("2026-08-22T10:00:00Z");
    expect(text(element)).toContain("Ищем источники…");
    expect(query(element, "time")?.textContent).toBe("1:20");
  });

  it("announces the activity politely, without reading every tick of the timer", async () => {
    const element = await render("2026-08-22T10:00:00Z");
    const live = query(element, "[role=status]");
    expect(live?.textContent).toContain("Ищем источники");
    expect(live?.querySelector("time")).toBeNull();
  });

  it("carries the hint that the app may be closed", async () => {
    const element = await render("2026-08-22T10:00:00Z", "Можно закрыть приложение, результат придёт сам");
    expect(text(element)).toContain("Можно закрыть приложение");
  });

  it("shows no timer when the start is unknown", async () => {
    const element = await render("");
    expect(query<HTMLElement>(element, "time")?.hidden).toBe(true);
  });
});

describe("ui-task-status steps", () => {
  it("shows what the work is doing right now, the current step in the live region", async () => {
    const element = new UiTaskStatus();
    element.label = "Ищу источники";
    element.steps = ["Поиск 2: «tokio»", "Смотрю: tokio.rs"];
    await mount(element);

    expect(text(element)).toContain("Поиск 2: «tokio»");
    expect(text(element)).toContain("Смотрю: tokio.rs");
    expect(query(element, "[role=status]")?.textContent).toContain("Поиск 2: «tokio»");
  });
});
