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

  it("shows three ideas at a time, so the choice stays small", async () => {
    const element = await view({ ideas: [1, 2, 3, 4, 5, 6, 7].map(idea) });
    expect(queryAll(element, "li")).toHaveLength(3);

    const asked = capture<null>(element, "suggestions-more");
    await click(element, buttonNamed(element, "Ещё 3"));
    expect(queryAll(element, "li")).toHaveLength(6);
    expect(asked).toHaveLength(0);
  });

  it("asks for more only once the ones it has are all shown", async () => {
    const element = await view({ ideas: [1, 2, 3].map(idea) });
    const asked = capture<null>(element, "suggestions-more");

    await click(element, buttonNamed(element, "Ещё 3"));

    expect(asked).toHaveLength(1);
    element.ideas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(idea);
    await element.updateComplete;
    expect(queryAll(element, "li")).toHaveLength(6);
  });

  it("reads as a list of lines, not a stack of boxes", async () => {
    const element = await view({ ideas: [idea(1)] });
    const css = [PnaSuggestions.styles].flat(3).map(String).join(" ");
    expect(css).not.toMatch(/border:\s*1px solid var\(--pna-border\)/);
    expect(query(element, "li button")).not.toBeNull();
  });

  it("folds to the picked idea once one is chosen, and opens again on request", async () => {
    const element = await view({ ideas: [1, 2, 3].map(idea), picked: "Идея 2" });
    expect(queryAll(element, "li")).toHaveLength(1);
    expect(text(element)).toContain("Идея 2");

    await click(element, buttonNamed(element, "Другие варианты"));
    expect(queryAll(element, "li")).toHaveLength(3);
  });

  it("never prints a running count of ideas", async () => {
    const element = await view({ ideas: [1, 2, 3].map(idea) });
    expect(text(element)).not.toMatch(/Вариантов:/);
  });

  it("marks the idea the card was filled from", async () => {
    const element = await view({ ideas: [idea(1), idea(2)], picked: "Идея 2" });
    await click(element, buttonNamed(element, "Другие варианты"));

    expect(queryAll(element, "li button")[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(queryAll(element, "li button")[0]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("while ideas are coming it says so and cannot be asked twice", async () => {
    const element = await view({ ideas: [idea(1)], busy: true });

    expect(query(element, "[role=status]")?.textContent).toContain("Подбираю варианты");
    expect(buttonNamed(element, "Ещё 3")?.hasAttribute("disabled")).toBe(true);
  });

  it("shows why ideas did not come", async () => {
    const element = await view({ error: "Нет ключа" });
    expect(query(element, "ui-notice")?.getAttribute("message")).toBe("Нет ключа");
  });
});
