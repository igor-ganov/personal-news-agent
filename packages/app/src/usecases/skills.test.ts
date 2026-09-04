import { createMockProvider, type ContentProvider } from "@pna/agent";
import {
  emptyAnswers,
  programLessons,
  quizOfLesson,
  type CalendarDay,
  type LessonId,
  type ProgramDraft,
  type ProgramId,
  type Schedule,
  type TopicId,
} from "@pna/core";
import { describe, expect, it, vi } from "vitest";
import { failingProvider, harness, produced } from "../testing/harness.js";
import {
  changeSchedule,
  commitProgram,
  deleteProgram,
  draftProgram,
  generateLesson,
  generateQuiz,
  markLesson,
  submitQuiz,
} from "./skills.js";
import { addTopic } from "./topics.js";

const schedule: Schedule = {
  startDay: "2026-09-01" as CalendarDay,
  intensity: { weeks: 2, sessionsPerWeek: 2, minutesPerSession: 45 },
};

const draft: ProgramDraft = {
  title: "Локальный инференс",
  goal: "30B на ноутбуке",
  rationale: "потому что",
  modules: [
    {
      title: "Основы",
      objective: "понять механику",
      lessons: [
        { title: "Как работает инференс", objective: "механика", estimatedMinutes: 45 },
        { title: "Квантизация", objective: "что теряется", estimatedMinutes: 45 },
      ],
    },
  ],
};

const setup = (provider: ContentProvider = createMockProvider()) => {
  const h = harness({ provider });
  const created = addTopic(h.ctx, { parentId: null, title: "Инференс" });
  if (!created.ok) throw new Error("expected ok");
  return { ...h, topicId: created.value.id };
};

const withProgram = (provider?: ContentProvider) => {
  const s = setup(provider);
  const committed = commitProgram(s.ctx, {
    topicId: s.topicId,
    draft,
    schedule,
    basedOn: [],
    continuation: "fresh",
  });
  if (!committed.ok) throw new Error("expected ok");
  return { ...s, program: committed.value };
};

describe("draftProgram", () => {
  it("returns a plan without storing anything", async () => {
    const { ctx, state, topicId } = setup();
    const result = await draftProgram(ctx, {
      topicId,
      intent: "хочу практику",
      schedule,
      basedOn: [],
      continuation: "fresh",
    });

    expect(result.ok).toBe(true);
    expect(state().programs).toEqual({});
  });

  it("hands the provider the material from the programs it builds on", async () => {
    const calls: any[] = [];
    const provider: ContentProvider = {
      ...createMockProvider(),
      draftProgram: vi.fn(async (input) => {
        calls.push(input);
        return createMockProvider().draftProgram(input);
      }),
    };
    const { ctx, topicId, program } = withProgram(provider);

    await draftProgram(ctx, {
      topicId,
      intent: "глубже",
      schedule,
      basedOn: [program.id],
      continuation: "deepen",
    });

    expect(calls[0].continuation).toBe("deepen");
    expect(calls[0].priorMaterial.map((m: { lessonTitle: string }) => m.lessonTitle)).toEqual([
      "Как работает инференс",
      "Квантизация",
    ]);
  });

  it("reports an unknown topic and a provider failure", async () => {
    const { ctx } = harness();
    expect(
      await draftProgram(ctx, {
        topicId: "ghost" as TopicId,
        intent: "",
        schedule,
        basedOn: [],
        continuation: "fresh",
      }),
    ).toMatchObject({ ok: false, error: { kind: "domain" } });

    const failing = setup(failingProvider());
    expect(
      await draftProgram(failing.ctx, {
        topicId: failing.topicId,
        intent: "",
        schedule,
        basedOn: [],
        continuation: "fresh",
      }),
    ).toMatchObject({ ok: false, error: { kind: "network" } });
  });
});

describe("commitProgram", () => {
  it("stores the program with dated sessions", () => {
    const { state, program } = withProgram();
    expect(state().programs[program.id]).toEqual(program);
    expect(programLessons(program).map((l) => l.scheduledFor)).toEqual(["2026-09-01", "2026-09-05"]);
  });

  it("refuses a plan with nothing in it", () => {
    const { ctx, topicId } = setup();
    expect(
      commitProgram(ctx, {
        topicId,
        draft: { ...draft, modules: [] },
        schedule,
        basedOn: [],
        continuation: "fresh",
      }),
    ).toEqual({
      ok: false,
      error: { kind: "domain", message: "В плане должен остаться хотя бы один модуль с занятием" },
    });
  });

  it("refuses an impossible intensity with a readable message", () => {
    const { ctx, topicId } = setup();
    expect(
      commitProgram(ctx, {
        topicId,
        draft,
        schedule: { ...schedule, intensity: { ...schedule.intensity, sessionsPerWeek: 9 } },
        basedOn: [],
        continuation: "fresh",
      }),
    ).toEqual({
      ok: false,
      error: { kind: "domain", message: "Занятий в неделю может быть от 1 до 7" },
    });
  });
});

describe("changeSchedule", () => {
  it("re-dates the sessions", () => {
    const { ctx, program } = withProgram();
    const result = changeSchedule(ctx, program.id, {
      startDay: "2026-10-01" as CalendarDay,
      intensity: { weeks: 2, sessionsPerWeek: 1, minutesPerSession: 60 },
    });
    if (!result.ok) throw new Error("expected ok");
    expect(programLessons(result.value).map((l) => l.scheduledFor)).toEqual([
      "2026-10-01",
      "2026-10-08",
    ]);
  });

  it("reports an unknown program", () => {
    const { ctx } = harness();
    expect(changeSchedule(ctx, "ghost" as ProgramId, schedule)).toMatchObject({ ok: false });
  });
});

describe("generateLesson", () => {
  it("stores the lecture and marks the session ready", async () => {
    const { ctx, state, program } = withProgram();
    const lessonId = programLessons(program)[0]!.id;

    const result = await generateLesson(ctx, lessonId);
    if (!result.ok) throw new Error("expected ok");
    expect(state().lessonContent[lessonId]).toMatchObject({
      ...produced(result.value),
      lessonId,
    });
    expect(programLessons(state().programs[program.id]!)[0]!.status).toBe("ready");
  });

  it("does not un-finish a session that is already done", async () => {
    const { ctx, state, program } = withProgram();
    const lessonId = programLessons(program)[0]!.id;
    markLesson(ctx, lessonId, "done");

    await generateLesson(ctx, lessonId);
    expect(programLessons(state().programs[program.id]!)[0]!.status).toBe("done");
  });

  it("tells the provider what this program has already covered", async () => {
    const calls: any[] = [];
    const provider: ContentProvider = {
      ...createMockProvider(),
      writeLesson: vi.fn(async (input) => {
        calls.push(input);
        return createMockProvider().writeLesson(input);
      }),
    };
    const { ctx, program } = withProgram(provider);

    await generateLesson(ctx, programLessons(program)[1]!.id);
    expect(calls[0].coveredInProgram).toEqual(["Как работает инференс"]);
    expect(calls[0].moduleTitle).toBe("Основы");
  });

  it("reports an unknown lesson", async () => {
    const { ctx } = harness();
    expect(await generateLesson(ctx, "ghost" as LessonId)).toEqual({
      ok: false,
      error: { kind: "domain", message: "Занятие не найдено" },
    });
  });
});

describe("generateQuiz", () => {
  it("needs the lecture first", async () => {
    const { ctx, program } = withProgram();
    expect(await generateQuiz(ctx, programLessons(program)[0]!.id)).toEqual({
      ok: false,
      error: { kind: "domain", message: "Сначала нужно сгенерировать лекцию" },
    });
  });

  it("stores the quiz for the lesson", async () => {
    const { ctx, state, program } = withProgram();
    const lessonId = programLessons(program)[0]!.id;
    await generateLesson(ctx, lessonId);

    const result = await generateQuiz(ctx, lessonId);
    if (!result.ok) throw new Error("expected ok");
    expect(produced(result.value).questions.length).toBeGreaterThan(0);
    expect(quizOfLesson(state(), lessonId)?.lessonId).toBe(lessonId);
  });

  it("regenerating replaces the questions but keeps the quiz id", async () => {
    const { ctx, state, program } = withProgram();
    const lessonId = programLessons(program)[0]!.id;
    await generateLesson(ctx, lessonId);

    const first = await generateQuiz(ctx, lessonId);
    const firstId = quizOfLesson(state(), lessonId)?.id;
    const second = await generateQuiz(ctx, lessonId);
    if (!first.ok || !second.ok) throw new Error("expected ok");
    expect(quizOfLesson(state(), lessonId)?.id).toBe(firstId);
    expect(Object.keys(state().quizzes)).toHaveLength(1);
  });
});

describe("submitQuiz", () => {
  it("refuses before a quiz exists", () => {
    const { ctx, program } = withProgram();
    expect(submitQuiz(ctx, programLessons(program)[0]!.id, emptyAnswers())).toEqual({
      ok: false,
      error: { kind: "domain", message: "Тест ещё не создан" },
    });
  });

  it("records a graded attempt", async () => {
    const { ctx, state, program } = withProgram();
    const lessonId = programLessons(program)[0]!.id;
    await generateLesson(ctx, lessonId);
    const quiz = await generateQuiz(ctx, lessonId);
    if (!quiz.ok) throw new Error("expected ok");

    const stored = quizOfLesson(state(), lessonId);
    if (!stored) throw new Error("expected a stored quiz");
    const answers = {
      choices: Object.fromEntries(stored.questions.map((q) => [q.id, ["a"]])),
      texts: {},
    };
    const attempt = submitQuiz(ctx, lessonId, answers);
    if (!attempt.ok) throw new Error("expected ok");
    expect(attempt.value.result.score).toBe(1);
    expect(state().attempts[attempt.value.id]).toEqual(attempt.value);
  });

  it("leaves marking the session done to the user", async () => {
    const { ctx, state, program } = withProgram();
    const lessonId = programLessons(program)[0]!.id;
    await generateLesson(ctx, lessonId);
    await generateQuiz(ctx, lessonId);
    submitQuiz(ctx, lessonId, emptyAnswers());

    expect(programLessons(state().programs[program.id]!)[0]!.status).toBe("ready");
    markLesson(ctx, lessonId, "done");
    expect(programLessons(state().programs[program.id]!)[0]!.status).toBe("done");
  });
});

describe("deleteProgram", () => {
  it("takes the lectures, quizzes and attempts with it", async () => {
    const { ctx, state, program } = withProgram();
    const lessonId = programLessons(program)[0]!.id;
    await generateLesson(ctx, lessonId);
    await generateQuiz(ctx, lessonId);
    submitQuiz(ctx, lessonId, emptyAnswers());

    deleteProgram(ctx, program.id);
    expect(state().programs).toEqual({});
    expect(state().lessonContent).toEqual({});
    expect(state().quizzes).toEqual({});
    expect(state().attempts).toEqual({});
  });

  it("reports an unknown program", () => {
    const { ctx } = harness();
    expect(deleteProgram(ctx, "ghost" as ProgramId)).toMatchObject({ ok: false });
  });
});
