import type { LessonId, PriorMaterial, ProgramId } from "@pna/core";
import { describe, expect, it } from "vitest";
import { toDigestDraft } from "./digest.js";
import { parseModelInstant } from "./instant.js";
import { toolInputSchema } from "./json-schema.js";
import { toLessonContentDraft } from "./lesson.js";
import { toProgramDraft } from "./program.js";
import { discoverSourcesSchema, toSourceCandidates } from "./sources.js";
import { quizSchema, toQuizDraft } from "./quiz.js";

describe("toolInputSchema", () => {
  it("emits a closed object schema with every field required", () => {
    const schema = toolInputSchema(discoverSourcesSchema) as {
      additionalProperties: boolean;
      required: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["sources"]);
  });
});

describe("parseModelInstant", () => {
  it("normalises a date the model wrote", () => {
    expect(parseModelInstant("2026-08-21")).toBe("2026-08-21T00:00:00.000Z");
    expect(parseModelInstant(" 2026-08-21T10:00:00Z ")).toBe("2026-08-21T10:00:00.000Z");
  });

  it("returns null for the empty string and for nonsense", () => {
    expect(parseModelInstant("")).toBeNull();
    expect(parseModelInstant("недавно")).toBeNull();
  });
});

describe("toSourceCandidates", () => {
  it("trims and keeps well-formed candidates", () => {
    const parsed = discoverSourcesSchema.parse({
      sources: [
        { title: " Блог ", url: " https://a.com/feed ", kind: "rss", rationale: " по теме " },
      ],
    });
    expect(toSourceCandidates(parsed)).toEqual([
      { title: "Блог", url: "https://a.com/feed", kind: "rss", rationale: "по теме" },
    ]);
  });

  it("drops entries without a url or a title", () => {
    const parsed = discoverSourcesSchema.parse({
      sources: [
        { title: "", url: "https://a.com", kind: "site", rationale: "" },
        { title: "Есть", url: "  ", kind: "site", rationale: "" },
      ],
    });
    expect(toSourceCandidates(parsed)).toEqual([]);
  });

  it("rejects an unknown source kind at parse time", () => {
    expect(
      discoverSourcesSchema.safeParse({
        sources: [{ title: "x", url: "y", kind: "telepathy", rationale: "" }],
      }).success,
    ).toBe(false);
  });
});

describe("toDigestDraft", () => {
  const payload = {
    headline: " Заголовок ",
    summary: " Выжимка ",
    sections: [
      {
        title: " Релизы ",
        items: [
          {
            title: " vLLM 0.9 ",
            url: " https://a.com/x ",
            source_title: " vLLM blog ",
            published_at: "2026-08-21",
            summary: " Что вышло ",
            relevance: " Влияет на латентность ",
            tags: [" perf ", "  "],
          },
        ],
      },
      { title: "Пусто", items: [] },
    ],
  };

  it("trims, parses dates and maps to the domain shape", () => {
    const draft = toDigestDraft(payload);
    expect(draft.headline).toBe("Заголовок");
    expect(draft.sections[0]!.items[0]).toEqual({
      title: "vLLM 0.9",
      url: "https://a.com/x",
      sourceTitle: "vLLM blog",
      publishedAt: "2026-08-21T00:00:00.000Z",
      summary: "Что вышло",
      relevance: "Влияет на латентность",
      tags: ["perf"],
    });
  });

  it("drops empty sections", () => {
    expect(toDigestDraft(payload).sections.map((s) => s.title)).toEqual(["Релизы"]);
  });

  it("leaves the date null when the model does not know it", () => {
    const draft = toDigestDraft({
      ...payload,
      sections: [
        { ...payload.sections[0]!, items: [{ ...payload.sections[0]!.items[0]!, published_at: "" }] },
      ],
    });
    expect(draft.sections[0]!.items[0]!.publishedAt).toBeNull();
  });
});

describe("toProgramDraft", () => {
  const payload = {
    title: " Программа ",
    goal: " Цель ",
    rationale: " Обоснование ",
    modules: [
      {
        title: " Модуль ",
        objective: " Цель модуля ",
        lessons: [
          { title: " Урок 1 ", objective: "o", estimated_minutes: 45 },
          { title: "  ", objective: "o", estimated_minutes: 45 },
        ],
      },
      { title: "   ", objective: "", lessons: [] },
    ],
  };

  it("trims and drops nameless modules and lessons", () => {
    const draft = toProgramDraft(payload, 45);
    expect(draft.title).toBe("Программа");
    expect(draft.modules).toHaveLength(1);
    expect(draft.modules[0]!.lessons.map((l) => l.title)).toEqual(["Урок 1"]);
  });

  it("falls back to the session length when the model gives nonsense", () => {
    const draft = toProgramDraft(
      { ...payload, modules: [{ title: "М", objective: "", lessons: [{ title: "У", objective: "", estimated_minutes: 0 }] }] },
      60,
    );
    expect(draft.modules[0]!.lessons[0]!.estimatedMinutes).toBe(60);
  });

  it("clamps absurd lesson lengths", () => {
    const draft = toProgramDraft(
      { ...payload, modules: [{ title: "М", objective: "", lessons: [{ title: "У", objective: "", estimated_minutes: 900 }] }] },
      45,
    );
    expect(draft.modules[0]!.lessons[0]!.estimatedMinutes).toBe(240);
  });
});

describe("toLessonContentDraft", () => {
  const priorMaterial: PriorMaterial[] = [
    {
      programId: "p1" as ProgramId,
      programTitle: "Основы",
      lessonId: "l1" as LessonId,
      lessonTitle: "Что такое инференс",
      objective: "",
      covered: true,
    },
  ];

  const payload = {
    key_points: [" Точка ", "  "],
    body: " # Лекция ",
    diagrams: [
      { title: "Схема", mermaid: " graph TD; A-->B ", caption: "подпись" },
      { title: "Пустая", mermaid: "  ", caption: "" },
    ],
    links: [
      { title: "Док", url: " https://d.com ", kind: "doc" as const, why: "почитать" },
      { title: "Без ссылки", url: "", kind: "doc" as const, why: "" },
    ],
    news_hooks: [
      { headline: " Новость ", url: "https://n.com", published_at: "2026-08-20", relevance: "связано" },
    ],
    prior_references: [
      { lesson_id: "l1", title: "", note: " повторить " },
      { lesson_id: "ghost", title: "Выдумка", note: "нет такого" },
    ],
  };

  it("keeps only references to material that actually exists", () => {
    const draft = toLessonContentDraft(payload, priorMaterial);
    expect(draft.priorReferences).toEqual([
      { programId: "p1", lessonId: "l1", title: "Что такое инференс", note: "повторить" },
    ]);
  });

  it("drops empty diagrams and linkless links", () => {
    const draft = toLessonContentDraft(payload, priorMaterial);
    expect(draft.diagrams.map((d) => d.title)).toEqual(["Схема"]);
    expect(draft.diagrams[0]!.mermaid).toBe("graph TD; A-->B");
    expect(draft.links.map((l) => l.title)).toEqual(["Док"]);
  });

  it("keeps news hooks with a parsed date", () => {
    const draft = toLessonContentDraft(payload, priorMaterial);
    expect(draft.newsHooks[0]).toMatchObject({
      headline: "Новость",
      publishedAt: "2026-08-20T00:00:00.000Z",
    });
  });

  it("drops blank key points", () => {
    expect(toLessonContentDraft(payload, priorMaterial).keyPoints).toEqual(["Точка"]);
  });
});

describe("toQuizDraft", () => {
  const question = (over: Record<string, unknown> = {}) => ({
    id: "q1",
    kind: "single",
    prompt: "Вопрос?",
    options: [
      { id: "a", text: "А" },
      { id: "b", text: "Б" },
    ],
    correct_option_ids: ["a"],
    expected_points: [],
    explanation: "потому что",
    ...over,
  });

  const draft = (questions: unknown[]) => toQuizDraft(quizSchema.parse({ questions }));

  it("keeps a well-formed question", () => {
    expect(draft([question()]).questions[0]).toMatchObject({
      id: "q1",
      kind: "single",
      correctOptionIds: ["a"],
    });
  });

  it("promotes a single-choice question with several answers to multi", () => {
    expect(draft([question({ correct_option_ids: ["a", "b"], options: [
      { id: "a", text: "А" },
      { id: "b", text: "Б" },
      { id: "c", text: "В" },
    ] })]).questions[0]!.kind).toBe("multi");
  });

  it("drops a question whose correct answer is not among its options", () => {
    expect(draft([question({ correct_option_ids: ["zzz"] })]).questions).toEqual([]);
  });

  it("drops a question where every option is correct", () => {
    expect(draft([question({ correct_option_ids: ["a", "b"] })]).questions).toEqual([]);
  });

  it("drops a choice question with fewer than two options", () => {
    expect(draft([question({ options: [{ id: "a", text: "А" }] })]).questions).toEqual([]);
  });

  it("keeps open questions without options", () => {
    const questions = draft([
      question({ id: "q2", kind: "open", options: [], correct_option_ids: [], expected_points: [" KV-cache "] }),
    ]).questions;
    expect(questions[0]).toMatchObject({ kind: "open", expectedPoints: ["KV-cache"], options: [] });
  });

  it("de-duplicates question ids", () => {
    expect(draft([question(), question({ prompt: "Другой" })]).questions).toHaveLength(1);
  });

  it("drops questions with a blank prompt or id", () => {
    expect(draft([question({ prompt: "  " }), question({ id: " " })]).questions).toEqual([]);
  });
});
