import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, unmountAll } from "../testing/dom.js";
import { PnaProgramList, type ProgramTaskView } from "./pna-program-list.js";

afterEach(unmountAll);

const render = (task: ProgramTaskView) => {
  const element = new PnaProgramList();
  element.task = task;
  return mount(element);
};

const button = (element: PnaProgramList, label: string) =>
  queryAll<HTMLElement>(element, "ui-button, ui-pencil-button").find((b) => b.textContent?.includes(label)) ?? null;

describe("pna-program-list generation status", () => {
  it("shows a program being drafted, even after a restart, and says the app may be closed", async () => {
    const element = await render({ kind: "running", since: "2026-08-22T10:00:00Z" });

    expect(query(element, "ui-task-status")).not.toBeNull();
    expect(query(element, "ui-task-status")?.getAttribute("hint")).toContain(
      "можно закрыть приложение, результат придёт сам",
    );
  });

  it("does not let a second program start while one is being drafted", async () => {
    const element = await render({ kind: "running", since: "2026-08-22T10:00:00Z" });
    const starts = capture(element, "program-new");

    expect(button(element, "Новая программа")?.hasAttribute("disabled")).toBe(true);
    await click(element, button(element, "Новая программа"));
    expect(starts).toHaveLength(0);
  });

  it("shows a failed draft with retry and dismiss", async () => {
    const element = await render({ kind: "error", message: "Превышен лимит запросов" });
    const retries = capture(element, "program-retry");
    const dismissals = capture(element, "program-dismiss");

    // The message renders inside the notice's own shadow root.
    expect(query<HTMLElement & { message: string }>(element, 'ui-notice[tone="error"]')?.message).toBe(
      "Превышен лимит запросов",
    );
    await click(element, button(element, "Повторить"));
    await click(element, button(element, "Убрать"));

    expect(retries).toHaveLength(1);
    expect(dismissals).toHaveLength(1);
  });

  it("shows no status card when nothing is being drafted", async () => {
    const element = await render({ kind: "idle" });
    expect(query(element, "ui-task-status")).toBeNull();
    expect(button(element, "Новая программа")?.hasAttribute("disabled")).toBe(false);
  });
});
