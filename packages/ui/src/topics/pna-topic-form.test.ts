import { instantOf, topicId } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, unmountAll } from "../testing/dom.js";
import { PnaTopicForm, type TopicFormValue } from "./pna-topic-form.js";

afterEach(unmountAll);

describe("pna-topic-form ideas", () => {
  it("offers ideas only when asked to", async () => {
    const plain = await mount(new PnaTopicForm());
    expect(query(plain, "pna-suggestions")).toBeNull();

    const element = new PnaTopicForm();
    element.suggestible = true;
    await mount(element);
    expect(query(element, "pna-suggestions")).not.toBeNull();
  });

  it("a picked idea fills the card, and the edited card is what gets saved", async () => {
    const element = new PnaTopicForm();
    element.suggestible = true;
    await mount(element);
    const saved = capture<TopicFormValue>(element, "topic-save");

    query<HTMLElement>(element, "pna-suggestions")?.dispatchEvent(
      new CustomEvent("suggestion-pick", {
        detail: { title: "Async Rust", summary: "", brief: "Рантаймы и Pin", focus: ["Tokio", "Pin"] },
        bubbles: true,
        composed: true,
      }),
    );
    await element.updateComplete;
    query<HTMLElement>(element, "ui-field")?.dispatchEvent(
      new CustomEvent("field-input", { detail: "Async Rust в проде", bubbles: true, composed: true }),
    );
    await element.updateComplete;
    const create = queryAll<HTMLElement>(element, ".actions ui-button").find((button) =>
      (button.textContent ?? "").includes("Создать"),
    );
    await click(element, create ?? null);

    expect(saved[0]).toMatchObject({
      title: "Async Rust в проде",
      brief: "Рантаймы и Pin",
      focusAreas: [
        { title: "Tokio", detail: "", weight: 3 },
        { title: "Pin", detail: "", weight: 3 },
      ],
    });
  });
});

const proposal = (title: string) => ({
  kind: "topic" as const,
  brief: `About ${title}`,
  level: "advanced" as const,
  focus: [`${title}: releases`],
  excludes: ["Ads"],
});

const typeInto = async (element: PnaTopicForm, index: number, text: string, commit = false) => {
  const field = queryAll<HTMLElement>(element, "ui-field")[index];
  field?.dispatchEvent(new CustomEvent("field-input", { detail: text, bubbles: true, composed: true }));
  if (commit) field?.dispatchEvent(new CustomEvent("field-change", { detail: text, bubbles: true, composed: true }));
  await element.updateComplete;
};

describe("pna-topic-form settings from the name", () => {
  it("asks for settings when a new card's name is committed, once per name", async () => {
    const element = new PnaTopicForm();
    await mount(element);
    const asked = capture<string>(element, "setup-request");

    await typeInto(element, 0, "Rust", true);
    await typeInto(element, 0, "Rust", true);
    await typeInto(element, 0, "  ", true);

    expect(asked).toEqual(["Rust"]);
  });

  it("never asks while an existing topic is edited", async () => {
    const element = new PnaTopicForm();
    element.topic = {
      id: topicId("t1"),
      parentId: null,
      title: "Rust",
      brief: "",
      level: "intermediate",
      language: "ru",
      excludes: [],
      focusAreas: [],
      createdAt: instantOf("2026-11-15T00:00:00Z"),
      updatedAt: instantOf("2026-11-15T00:00:00Z"),
    };
    await mount(element);
    const asked = capture<string>(element, "setup-request");

    await typeInto(element, 0, "Rust 2", true);

    expect(asked).toEqual([]);
  });

  it("fills the card from a proposal, and a later one replaces only what the user did not write", async () => {
    const element = new PnaTopicForm();
    await mount(element);
    const saved = capture<TopicFormValue>(element, "topic-save");

    element.setup = proposal("Rust");
    await element.updateComplete;
    await typeInto(element, 1, "My own words");
    element.setup = proposal("Zig");
    await element.updateComplete;
    query<HTMLFormElement>(element, "form")?.requestSubmit();

    expect(saved[0]).toMatchObject({
      brief: "My own words",
      level: "advanced",
      excludes: ["Ads"],
      focusAreas: [{ title: "Zig: releases", detail: "", weight: 3 }],
    });
  });

  it("says what it is doing with the name", async () => {
    const element = new PnaTopicForm();
    element.setupBusy = true;
    await mount(element);
    expect(query(element, "[role=status]")?.textContent).toContain("Подбираю настройки");

    element.setupBusy = false;
    element.setup = proposal("Rust");
    await element.updateComplete;
    expect(query(element, "[role=status]")?.textContent).toContain("Настройки подобраны по названию");
  });
});

describe("pna-topic-form at first sight", () => {
  it("opens with the name and the interest only; the rest is folded with a line on what it holds", async () => {
    const element = await mount(new PnaTopicForm());
    const details = query<HTMLDetailsElement>(element, "details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("pna-focus-editor")).not.toBeNull();
    expect(details.querySelector("summary")!.textContent).toMatch(/Тонкая настройка\s+уровень средний, 0 разделов/);
  });

  it("keeps the way to finish pinned under the card", async () => {
    const element = await mount(new PnaTopicForm());
    const css = [PnaTopicForm.styles].flat(3).map(String).join(" ");
    expect(css).toMatch(/\.actions \{[^}]*position: sticky/);
    expect(query(element, ".actions ui-button[variant='primary']")).not.toBeNull();
  });
});
