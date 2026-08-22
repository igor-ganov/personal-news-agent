import { scoreQuiz, type Answers, type LessonId, type Question, type Quiz, type QuizId } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, text, unmountAll } from "../testing/dom.js";
import { PnaQuizView } from "./pna-quiz-view.js";

const question = (over: Partial<Question> = {}): Question => ({
  id: "q1",
  kind: "single",
  prompt: "Что растёт линейно с длиной контекста?",
  options: [
    { id: "a", text: "KV-cache" },
    { id: "b", text: "Число параметров" },
    { id: "c", text: "Размер словаря" },
  ],
  correctOptionIds: ["a"],
  expectedPoints: [],
  explanation: "KV-cache хранит по паре на токен.",
  ...over,
});

const quiz: Quiz = {
  id: "quiz_1" as QuizId,
  lessonId: "lesson_1" as LessonId,
  questions: [
    question(),
    question({ id: "q2", kind: "multi", correctOptionIds: ["a", "b"] }),
    question({
      id: "q3",
      kind: "open",
      options: [],
      correctOptionIds: [],
      expectedPoints: ["Упомянуть квантизацию"],
    }),
  ],
};

const render = async (over: Partial<PnaQuizView> = {}) => {
  const element = new PnaQuizView();
  Object.assign(element, over);
  return mount(element);
};

afterEach(unmountAll);

describe("pna-quiz-view", () => {
  it("offers to build the quiz when there is none", async () => {
    const element = await render();
    const events = capture(element, "quiz-generate");
    await click(element, query(element, "ui-button"));
    expect(events).toHaveLength(1);
  });

  it("renders radios for single choice and checkboxes for multi", async () => {
    const element = await render({ quiz });
    const inputs = queryAll<HTMLInputElement>(element, "input");
    expect(inputs.filter((i) => i.type === "radio")).toHaveLength(3);
    expect(inputs.filter((i) => i.type === "checkbox")).toHaveLength(3);
  });

  it("renders a text field for an open question", async () => {
    const element = await render({ quiz });
    expect(queryAll(element, "ui-field")).toHaveLength(1);
  });

  it("submits the answers the user selected", async () => {
    const element = await render({ quiz });
    const events = capture<Answers>(element, "quiz-submit");

    const inputs = queryAll<HTMLInputElement>(element, "input");
    inputs[0]!.dispatchEvent(new Event("change"));
    await element.updateComplete;

    const submit = queryAll(element, "ui-button").at(-1) ?? null;
    await click(element, submit);

    expect(events).toHaveLength(1);
    expect(events[0]!.choices["q1"]).toEqual(["a"]);
  });

  it("keeps only one option for a single-choice question", async () => {
    const element = await render({ quiz });
    const events = capture<Answers>(element, "quiz-submit");

    const radios = queryAll<HTMLInputElement>(element, 'input[type="radio"]');
    radios[0]!.dispatchEvent(new Event("change"));
    await element.updateComplete;
    radios[1]!.dispatchEvent(new Event("change"));
    await element.updateComplete;

    await click(element, queryAll(element, "ui-button").at(-1) ?? null);
    expect(events[0]!.choices["q1"]).toEqual(["b"]);
  });

  it("accumulates options for a multi-select and toggles them off again", async () => {
    const element = await render({ quiz });
    const events = capture<Answers>(element, "quiz-submit");

    const boxes = queryAll<HTMLInputElement>(element, 'input[type="checkbox"]');
    boxes[0]!.dispatchEvent(new Event("change"));
    await element.updateComplete;
    boxes[1]!.dispatchEvent(new Event("change"));
    await element.updateComplete;
    boxes[0]!.dispatchEvent(new Event("change"));
    await element.updateComplete;

    await click(element, queryAll(element, "ui-button").at(-1) ?? null);
    expect(events[0]!.choices["q2"]).toEqual(["b"]);
  });

  it("shows the score and per-question verdicts once graded", async () => {
    const answers: Answers = { choices: { q1: ["a"], q2: ["a"] }, texts: { q3: "квантизация" } };
    const element = await render({ quiz, result: scoreQuiz(quiz, answers) });

    expect(text(element)).toContain("Результат: 1 из 2");
    expect(text(element)).toContain("на самопроверку");
    expect(text(element)).toContain("KV-cache хранит по паре на токен.");
  });

  it("spells out what a good open answer needs", async () => {
    const element = await render({ quiz, result: scoreQuiz(quiz, { choices: {}, texts: { q3: "ответ" } }) });
    expect(text(element)).toContain("Упомянуть квантизацию");
  });

  it("locks the inputs after grading", async () => {
    const element = await render({ quiz, result: scoreQuiz(quiz, { choices: {}, texts: {} }) });
    expect(queryAll<HTMLInputElement>(element, "input").every((i) => i.disabled)).toBe(true);
  });

  it("offers a retry and a fresh set of questions after grading", async () => {
    const element = await render({ quiz, result: scoreQuiz(quiz, { choices: {}, texts: {} }) });
    const retry = capture(element, "quiz-retry");
    await click(element, queryAll(element, "ui-button")[0] ?? null);
    expect(retry).toHaveLength(1);
  });

  it("clears the answers when a new quiz arrives", async () => {
    const element = await render({ quiz });
    const boxes = queryAll<HTMLInputElement>(element, 'input[type="radio"]');
    boxes[0]!.dispatchEvent(new Event("change"));
    await element.updateComplete;

    element.quiz = { ...quiz, id: "quiz_2" as QuizId };
    await element.updateComplete;

    const events = capture<Answers>(element, "quiz-submit");
    await click(element, queryAll(element, "ui-button").at(-1) ?? null);
    expect(events[0]!.choices).toEqual({});
  });
});
