import type { LessonContent, LessonId, LessonPlan, LessonStatus, ModuleId, ProgramId } from "@pna/core";
import { afterEach, describe, expect, it } from "vitest";
import { capture, click, mount, query, queryAll, text, unmountAll } from "../testing/dom.js";
import { PnaLessonView } from "./pna-lesson-view.js";

const lesson = (status: LessonStatus = "planned"): LessonPlan => ({
  id: "l1" as LessonId,
  moduleId: "m1" as ModuleId,
  order: 0,
  title: "Квантизация",
  objective: "Понять, что теряется",
  estimatedMinutes: 45,
  scheduledFor: null,
  status,
});

const content = (over: Partial<LessonContent> = {}): LessonContent => ({
  lessonId: "l1" as LessonId,
  generatedAt: "2026-08-22T10:00:00.000Z" as never,
  keyPoints: ["KV-cache растёт линейно"],
  body: "# Квантизация\n\nТело лекции.",
  diagrams: [{ title: "Схема", mermaid: "graph TD; A-->B", caption: "поток" }],
  links: [
    { title: "Док", url: "https://example.com/doc", kind: "doc", why: "справочник" },
  ],
  newsHooks: [
    {
      headline: "vLLM 0.9",
      url: "https://example.com/news",
      publishedAt: "2026-08-20T00:00:00.000Z" as never,
      relevance: "меняет расклад по latency",
    },
  ],
  priorReferences: [
    {
      programId: "p0" as ProgramId,
      lessonId: "l0" as LessonId,
      title: "Что такое инференс",
      note: "повторить основы",
    },
  ],
  ...over,
});

const render = async (over: Partial<PnaLessonView> = {}) => {
  const element = new PnaLessonView();
  element.lesson = lesson();
  Object.assign(element, over);
  return mount(element);
};

afterEach(unmountAll);

describe("pna-lesson-view", () => {
  it("offers to write the lecture when there is none", async () => {
    const element = await render();
    const events = capture(element, "lesson-generate");
    await click(element, query(element, "ui-button"));
    expect(events).toHaveLength(1);
  });

  it("shows a generation error", async () => {
    const element = await render({ error: "Нет сети" });
    expect(query(element, 'ui-notice[tone="error"]')).not.toBeNull();
  });

  it("renders key points, the body and the diagram", async () => {
    const element = await render({ content: content() });
    expect(text(element)).toContain("KV-cache растёт линейно");
    expect(query(element, "ui-markdown")).not.toBeNull();
    expect(queryAll(element, "ui-diagram")).toHaveLength(1);
  });

  it("renders the news hooks that tie the lecture to now", async () => {
    const element = await render({ content: content() });
    expect(text(element)).toContain("Что происходит по теме сейчас");
    expect(text(element)).toContain("vLLM 0.9");
    expect(text(element)).toContain("меняет расклад по latency");
  });

  it("renders links and references to earlier programs", async () => {
    const element = await render({ content: content() });
    expect(query<HTMLAnchorElement>(element, "a.link")?.href).toBe("https://example.com/doc");
    expect(text(element)).toContain("Из предыдущих программ");
    expect(text(element)).toContain("Что такое инференс");
  });

  it("omits empty sections instead of showing empty headings", async () => {
    const element = await render({
      content: content({ newsHooks: [], links: [], priorReferences: [], diagrams: [] }),
    });
    expect(text(element)).not.toContain("Полезные ссылки");
    expect(text(element)).not.toContain("Из предыдущих программ");
    expect(queryAll(element, "ui-diagram")).toHaveLength(0);
  });

  it("navigates to a referenced lesson", async () => {
    const element = await render({ content: content() });
    const events = capture<LessonId>(element, "lesson-open");
    await click(element, query(element, "button.prior"));
    expect(events).toEqual(["l0"]);
  });

  it("toggles the completion mark", async () => {
    const element = await render({ content: content() });
    const events = capture<LessonStatus>(element, "lesson-status");
    await click(element, queryAll(element, ".actions ui-button")[2] ?? null);
    expect(events).toEqual(["done"]);
  });

  it("offers to un-mark a finished session", async () => {
    const element = await render({ lesson: lesson("done"), content: content() });
    const events = capture<LessonStatus>(element, "lesson-status");
    expect(text(element)).toContain("Снять отметку");
    await click(element, queryAll(element, ".actions ui-button")[2] ?? null);
    expect(events).toEqual(["ready"]);
  });

  it("labels the quiz button by whether one exists yet", async () => {
    const without = await render({ content: content() });
    expect(text(without)).toContain("Собрать тест");

    const withQuiz = await render({ content: content(), hasQuiz: true });
    expect(text(withQuiz)).toContain("К самопроверке");
  });
});
