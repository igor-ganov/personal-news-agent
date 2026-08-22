import { ok, type DigestDraft, type ProgramDraft, type QuizDraft, type SourceCandidate } from "@pna/core";
import type {
  BuildDigestInput,
  BuildQuizInput,
  ContentProvider,
  DiscoverSourcesInput,
  DraftProgramInput,
  WriteLessonInput,
} from "../ports/content-provider.js";

const hash = (value: string): string => {
  let h = 0;
  for (const char of value) h = (h * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return h.toString(36);
};

/** ASCII-only, so the generated URLs stay comparable without punycode surprises. */
const slug = (value: string): string => {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return ascii || `t${hash(value)}`;
};

/**
 * A deterministic provider: same input, same output, no network.
 *
 * It backs offline development and the app's own tests, and it is what the
 * settings screen falls back to when no API key is configured — so every
 * screen stays usable before the user has set anything up.
 */
export const createMockProvider = (): ContentProvider => ({
  id: "mock",

  async discoverSources(input: DiscoverSourcesInput) {
    const base = slug(input.context.topic.title);
    const known = new Set(input.known.map((s) => s.key));
    const blocked = new Set(input.blockedHosts);

    const candidates: SourceCandidate[] = input.context.focusAreas
      .slice(0, input.limit)
      .map((focus, i) => ({
        title: `${focus.title} — дайджест`,
        url: `https://${base}-${i + 1}.example/feed`,
        kind: i % 2 === 0 ? ("rss" as const) : ("blog" as const),
        rationale: `Покрывает фокус «${focus.title}»`,
      }));

    const fallback: SourceCandidate = {
      title: `${input.context.topic.title} weekly`,
      url: `https://${base}.example/weekly`,
      kind: "newsletter",
      rationale: "Обзорная рассылка по теме",
    };

    return ok(
      [...candidates, fallback]
        .filter((c) => !blocked.has(new URL(c.url).hostname))
        .filter((c) => !known.has(`${new URL(c.url).hostname}${new URL(c.url).pathname}`))
        .slice(0, input.limit),
    );
  },

  async buildDigest(input: BuildDigestInput) {
    const draft: DigestDraft = {
      headline: `${input.context.topic.title}: что нового`,
      summary: `Заглушка дайджеста за период ${input.window.from} — ${input.window.to}.`,
      sections: input.context.focusAreas.slice(0, 2).map((focus, i) => ({
        title: focus.title,
        items: [
          {
            title: `Обновление по «${focus.title}»`,
            url: `https://example.invalid/${slug(focus.title)}-${i}`,
            sourceTitle: input.sources[0]?.title ?? "example",
            publishedAt: input.window.from,
            summary: "Демонстрационный элемент дайджеста без обращения к сети.",
            relevance: `Соответствует фокусу «${focus.title}»`,
            tags: ["mock"],
          },
        ],
      })),
      sourceIds: [],
    };
    return ok(draft);
  },

  async draftProgram(input: DraftProgramInput) {
    const sessions = Math.max(1, input.weeks * input.sessionsPerWeek);
    const moduleCount = Math.min(3, sessions);
    const perModule = Math.ceil(sessions / moduleCount);

    const draft: ProgramDraft = {
      title: `${input.context.topic.title}: программа`,
      goal: input.intent.trim() || `Разобраться в теме «${input.context.topic.title}»`,
      rationale: `Заглушка плана на ${input.weeks} нед. в режиме «${input.continuation}».`,
      modules: Array.from({ length: moduleCount }, (_, m) => ({
        title: `Модуль ${m + 1}`,
        objective: `Освоить блок ${m + 1}`,
        lessons: Array.from(
          { length: Math.min(perModule, sessions - m * perModule) },
          (_, l) => ({
            title: `Занятие ${m * perModule + l + 1}`,
            objective: `Цель занятия ${m * perModule + l + 1}`,
            estimatedMinutes: input.minutesPerSession,
          }),
        ),
      })).filter((module) => module.lessons.length > 0),
    };
    return ok(draft);
  },

  async writeLesson(input: WriteLessonInput) {
    return ok({
      keyPoints: [`Ключевая мысль по теме «${input.lesson.title}»`],
      body: [
        `# ${input.lesson.title}`,
        "",
        `Цель: ${input.lesson.objective}`,
        "",
        "Это офлайн-заглушка лекции. Подключите ключ API, чтобы получать настоящий материал.",
      ].join("\n"),
      diagrams: [
        {
          title: "Схема",
          mermaid: "graph TD;\n  Вход-->Обработка;\n  Обработка-->Результат;",
          caption: "Условная схема процесса",
        },
      ],
      links: [],
      newsHooks: [],
      priorReferences: input.priorMaterial.slice(0, 2).map((m) => ({
        programId: m.programId,
        lessonId: m.lessonId,
        title: m.lessonTitle,
        note: "Материал из предыдущей программы",
      })),
    });
  },

  async buildQuiz(input: BuildQuizInput) {
    const draft: QuizDraft = {
      questions: Array.from({ length: Math.max(1, Math.min(input.questionCount, 5)) }, (_, i) => ({
        id: `q${i + 1}`,
        kind: "single" as const,
        prompt: `Вопрос ${i + 1} по занятию «${input.lesson.title}»`,
        options: [
          { id: "a", text: "Верный вариант" },
          { id: "b", text: "Неверный вариант" },
          { id: "c", text: "Тоже неверный" },
        ],
        correctOptionIds: ["a"],
        expectedPoints: [],
        explanation: "Заглушка объяснения.",
      })),
    };
    return ok(draft);
  },
});
