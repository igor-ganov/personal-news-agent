import type { Suggestion } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, text, unmountAll } from "../testing/dom.js";
import { PnaSuggestions } from "./pna-suggestions.js";

afterEach(unmountAll);

const idea = (n: number): Suggestion => ({
  title: `Идея ${n}`,
  summary: `Зачем ${n}`,
  brief: `Описание ${n}`,
  focus: [],
});

const view = async (props: Partial<PnaSuggestions> = {}): Promise<PnaSuggestions> => {
  const element = new PnaSuggestions();
  Object.assign(element, props);
  return mount(element);
};

const buttonNamed = (element: PnaSuggestions, name: string): HTMLElement | null =>
  queryAll<HTMLElement>(element, "ui-button").find((button) =>
    (button.textContent ?? "").includes(name),
  ) ?? null;

describe("pna-suggestions", () => {
  it("starts with one button that asks for ideas", async () => {
    const element = await view();
    const asked = capture<null>(element, "suggestions-more");

    await click(element, buttonNamed(element, "Подобрать варианты"));

    expect(asked).toHaveLength(1);
  });

  it("lists the ideas, and a picked one comes back whole", async () => {
    const ideas = [idea(1), idea(2)];
    const element = await view({ ideas });
    const picked = capture<Suggestion>(element, "suggestion-pick");

    expect(text(element)).toContain("Идея 2");
    expect(text(element)).toContain("Зачем 2");
    await click(element, queryAll(element, "li button")[1] ?? null);

    expect(picked).toEqual([idea(2)]);
  });

  it("offers ten more under the list", async () => {
    const element = await view({ ideas: [idea(1)] });
    const asked = capture<null>(element, "suggestions-more");

    await click(element, buttonNamed(element, "Ещё 10"));

    expect(asked).toHaveLength(1);
  });

  it("marks the idea the card was filled from", async () => {
    const element = await view({ ideas: [idea(1), idea(2)], picked: "Идея 2" });

    expect(queryAll(element, "li button")[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(queryAll(element, "li button")[0]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("while ideas are coming it says so and cannot be asked twice", async () => {
    const element = await view({ ideas: [idea(1)], busy: true });

    expect(query(element, "[role=status]")?.textContent).toContain("Подбираю варианты");
    expect(buttonNamed(element, "Ещё 10")?.hasAttribute("disabled")).toBe(true);
  });

  it("shows why ideas did not come", async () => {
    const element = await view({ error: "Нет ключа" });
    expect(query(element, "ui-notice")?.getAttribute("message")).toBe("Нет ключа");
  });
});
