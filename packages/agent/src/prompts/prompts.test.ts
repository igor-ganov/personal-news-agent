import {
  focusId,
  instantOf,
  topicContextOf,
  type LessonId,
  type PriorMaterial,
  type ProgramId,
  type Source,
  type SourceId,
  type TopicContext,
  type TopicId,
} from "@pna/core";
import { describe, expect, it } from "vitest";
import { digestPrompt, digestSystem } from "./digest.js";
import { lessonPrompt } from "./lesson.js";
import { programPrompt, programSystem, renderPriorMaterial } from "./program.js";
import { quizPrompt } from "./quiz.js";
import { discoverSourcesPrompt } from "./sources.js";
import { renderBlockedHosts, renderSourceList, renderTopicContext } from "./context.js";

const T0 = instantOf("2026-08-22T10:00:00Z");

const topics = {
  ["ai" as TopicId]: {
    id: "ai" as TopicId,
    parentId: null,
    title: "ИИ",
    brief: "Практическое применение",
    focusAreas: [{ id: focusId("f1"), title: "Практика", detail: "только применимое", weight: 3 }],
    excludes: ["Хайп"],
    language: "ru",
    level: "intermediate" as const,
    createdAt: T0,
    updatedAt: T0,
  },
  ["inf" as TopicId]: {
    id: "inf" as TopicId,
    parentId: "ai" as TopicId,
    title: "Инференс",
    brief: "Гонять локально",
    focusAreas: [{ id: focusId("f2"), title: "Латентность", detail: "p99 на CPU", weight: 5 }],
    excludes: [],
    language: "ru",
    level: "advanced" as const,
    createdAt: T0,
    updatedAt: T0,
  },
};

const context = ((): TopicContext => {
  const result = topicContextOf(topics, "inf" as TopicId);
  if (!result.ok) throw new Error("fixture is broken");
  return result.value;
})();

const source: Source = {
  id: "s1" as SourceId,
  topicId: "inf" as TopicId,
  title: "vLLM blog",
  url: "https://blog.vllm.ai/feed",
  key: "blog.vllm.ai/feed",
  kind: "rss",
  origin: "discovered",
  status: "active",
  rationale: "релизы",
  addedAt: T0,
  lastConfirmedAt: null,
};

describe("renderTopicContext", () => {
  const rendered = renderTopicContext(context);

  it("carries the whole path, the level and the output language", () => {
    expect(rendered).toContain("TOPIC PATH: ИИ → Инференс");
    expect(rendered).toContain("LEVEL: advanced");
    expect(rendered).toContain("OUTPUT LANGUAGE: ru");
  });

  it("lists briefs from the root down", () => {
    expect(rendered.indexOf("ИИ: Практическое применение")).toBeLessThan(
      rendered.indexOf("Инференс: Гонять локально"),
    );
  });

  it("lists focus areas with the leaf's own first", () => {
    expect(rendered.indexOf("Латентность")).toBeLessThan(rendered.indexOf("Практика"));
    expect(rendered).toContain("Латентность (importance 5/5): p99 на CPU");
  });

  it("carries inherited exclusions", () => {
    expect(rendered).toContain("EXPLICITLY NOT INTERESTED IN:\n- Хайп");
  });

  it("contains nothing that varies between calls, so the prefix stays cacheable", () => {
    expect(renderTopicContext(context)).toBe(rendered);
    expect(rendered).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("renderSourceList and renderBlockedHosts", () => {
  it("says so explicitly when there are no sources yet", () => {
    expect(renderSourceList([])).toContain("no sources yet");
  });

  it("renders a source with its url and kind", () => {
    expect(renderSourceList([source])).toBe("- vLLM blog — https://blog.vllm.ai/feed (rss)");
  });

  it("emits nothing at all when the blacklist is empty", () => {
    expect(renderBlockedHosts([])).toBe("");
  });

  it("spells out the blacklist when there is one", () => {
    expect(renderBlockedHosts(["spam.example"])).toContain("- spam.example");
  });
});

describe("discoverSourcesPrompt", () => {
  const prompt = discoverSourcesPrompt({
    context,
    known: [source],
    blockedHosts: ["spam.example"],
    limit: 8,
    now: T0,
  });

  it("passes the limit through", () => {
    expect(prompt).toContain("up to 8 NEW sources");
  });

  it("names what is already in the list and what is banned", () => {
    expect(prompt).toContain("https://blog.vllm.ai/feed");
    expect(prompt).toContain("spam.example");
  });
});

describe("digest prompts", () => {
  it("scales its instructions to the period", () => {
    expect(digestSystem("day")).toContain("3-7 items");
    expect(digestSystem("year")).toContain("retrospective");
  });

  it("states the window as a half-open interval", () => {
    const prompt = digestPrompt({
      context,
      period: "week",
      window: { from: instantOf("2026-08-15T00:00:00Z"), to: instantOf("2026-08-22T00:00:00Z") },
      sources: [source],
      blockedHosts: [],
      now: T0,
    });
    expect(prompt).toContain("from 2026-08-15T00:00:00.000Z to 2026-08-22T00:00:00.000Z");
    expect(prompt).toContain("half-open");
  });
});

describe("program prompts", () => {
  const priorMaterial: PriorMaterial[] = [
    {
      programId: "p1" as ProgramId,
      programTitle: "Основы",
      lessonId: "l1" as LessonId,
      lessonTitle: "Что такое инференс",
      objective: "",
      covered: true,
    },
    {
      programId: "p1" as ProgramId,
      programTitle: "Основы",
      lessonId: "l2" as LessonId,
      lessonTitle: "KV-cache",
      objective: "",
      covered: false,
    },
  ];

  it("tells a fresh program not to assume prior material", () => {
    expect(programSystem("fresh")).toContain("standalone");
  });

  it("tells a continuation not to re-teach", () => {
    expect(programSystem("deepen")).toContain("Do not re-teach");
    expect(programSystem("apply")).toContain("builds, measures or ships");
  });

  it("computes the session budget from the intensity", () => {
    const prompt = programPrompt({
      context,
      intent: "хочу гонять 30B локально",
      weeks: 4,
      sessionsPerWeek: 3,
      minutesPerSession: 45,
      priorMaterial,
      continuation: "deepen",
      now: T0,
    });
    expect(prompt).toContain("that is 12 sessions in total; plan for at most 12 lessons");
    expect(prompt).toContain("хочу гонять 30B локально");
  });

  it("marks which prior lessons were actually completed", () => {
    const rendered = renderPriorMaterial(priorMaterial);
    expect(rendered).toContain('[l1] "Что такое инференс" (program: Основы) — completed');
    expect(rendered).toContain("planned, not studied yet");
  });

  it("says plainly when there is no prior material", () => {
    expect(renderPriorMaterial([])).toContain("first program");
  });
});

describe("lesson and quiz prompts", () => {
  const lesson = {
    id: "l9" as LessonId,
    moduleId: "m1" as never,
    order: 0,
    title: "Квантизация",
    objective: "Понять, что теряется",
    estimatedMinutes: 45,
    scheduledFor: null,
    status: "planned" as const,
  };

  it("gives the lecture its place in the program", () => {
    const prompt = lessonPrompt({
      context,
      programTitle: "Локальный инференс",
      programGoal: "30B на ноутбуке",
      moduleTitle: "Сжатие",
      lesson,
      coveredInProgram: ["Введение"],
      priorMaterial: [],
      blockedHosts: [],
      now: T0,
    });
    expect(prompt).toContain("module: Сжатие");
    expect(prompt).toContain("length: 45 minutes");
    expect(prompt).toContain("- Введение");
    expect(prompt).toContain("Search for recent developments");
  });

  it("says when the lecture is the first session", () => {
    const prompt = lessonPrompt({
      context,
      programTitle: "П",
      programGoal: "Ц",
      moduleTitle: "М",
      lesson,
      coveredInProgram: [],
      priorMaterial: [],
      blockedHosts: [],
      now: T0,
    });
    expect(prompt).toContain("(this is the first session)");
  });

  it("hands the quiz the lecture body and the question count", () => {
    const prompt = quizPrompt({
      context,
      lesson,
      lessonBody: "# Лекция\nтело",
      keyPoints: ["Точка"],
      questionCount: 5,
      now: T0,
    });
    expect(prompt).toContain("Write 5 questions");
    expect(prompt).toContain("# Лекция\nтело");
    expect(prompt).toContain("- Точка");
  });
});
