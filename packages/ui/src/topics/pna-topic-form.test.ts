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
