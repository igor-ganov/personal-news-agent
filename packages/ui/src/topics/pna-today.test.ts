import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, text, unmountAll } from "../testing/dom.js";
import { PnaToday } from "./pna-today.js";

const render = async (total: number, ready: number, running = 0) => {
  const element = new PnaToday();
  Object.assign(element, { total, ready, running });
  return mount(element);
};

afterEach(unmountAll);

describe("pna-today — the day at the top of the topic list", () => {
  it("offers one action that gathers the day for every topic still missing it", async () => {
    const element = await render(6, 2);
    expect(text(element)).toContain("Сегодня собрано по 2 из 6 тем");
    const events = capture(element, "today-collect");
    await click(element, query(element, "ui-button"));
    expect(events).toHaveLength(1);
  });

  it("says plainly that nothing is gathered yet", async () => {
    expect(text(await render(1, 0))).toContain("За сегодня ещё ничего не собрано");
  });

  it("has nothing to ask once every topic has its day", async () => {
    const element = await render(3, 3);
    expect(text(element)).toContain("Сегодня собрано по всем темам");
    expect(query(element, "ui-button")).toBeNull();
  });

  it("shows the gathering as it runs and says the app may be closed", async () => {
    const element = await render(6, 2, 4);
    expect(query(element, "ui-button")?.hasAttribute("busy")).toBe(true);
    expect(text(element)).toContain("Собираю по 4 темам");
    expect(text(element)).toContain("приложение можно закрыть");
  });
});
