import { describe, expect, it } from "vitest";
import { sequentialIds, type TopicId } from "../model/ids.js";
import type { ProgramDraft, Schedule } from "../model/skill.js";
import { makeProgram, T0 } from "../testing/builders.js";
import { instantOf, type CalendarDay } from "../time/instant.js";
import { materialiseProgram, rescheduleProgram, sessionDay } from "./materialise.js";

const lesson = (title: string) => ({ title, objective: `Цель ${title}`, estimatedMinutes: 45 });

const draft: ProgramDraft = {
  title: "Инференс на своём железе",
  goal: "Гонять 30B локально",
  rationale: "почему так",
  modules: [
    { title: "Модуль А", objective: "Цель А", lessons: [lesson("A1"), lesson("A2"), lesson("A3")] },
    { title: "Модуль Б", objective: "Цель Б", lessons: [lesson("B1")] },
  ],
};

// 2026-09-01 is a Tuesday.
const schedule: Schedule = {
  startDay: "2026-09-01" as CalendarDay,
  intensity: { weeks: 4, sessionsPerWeek: 3, minutesPerSession: 45 },
};

const materialise = (over: Partial<Parameters<typeof materialiseProgram>[0]> = {}) =>
  materialiseProgram({
    draft,
    topicId: "topic_1" as TopicId,
    schedule,
    basedOn: [],
    continuation: "fresh",
    ids: sequentialIds(),
    now: T0,
    ...over,
  });

describe("sessionDay", () => {
  it("places the first session on the start day", () => {
    expect(sessionDay("2026-09-01" as CalendarDay, 3, 0)).toBe("2026-09-01");
  });

  it("spreads a week's sessions across the offsets", () => {
    expect([0, 1, 2].map((i) => sessionDay("2026-09-01" as CalendarDay, 3, i))).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-06",
    ]);
  });

  it("rolls into the following week", () => {
    expect(sessionDay("2026-09-01" as CalendarDay, 3, 3)).toBe("2026-09-08");
    expect(sessionDay("2026-09-01" as CalendarDay, 3, 5)).toBe("2026-09-13");
  });

  it("handles one session a week and daily study alike", () => {
    expect(sessionDay("2026-09-01" as CalendarDay, 1, 2)).toBe("2026-09-15");
    expect(sessionDay("2026-09-01" as CalendarDay, 7, 8)).toBe("2026-09-09");
  });
});

describe("materialiseProgram", () => {
  it("assigns ids to every module and lesson", () => {
    const result = materialise();
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.id).toBe("program_1");
    expect(result.value.modules.map((m) => m.id)).toEqual(["module_1", "module_2"]);
    expect(result.value.modules[0]!.lessons.map((l) => l.id)).toEqual([
      "lesson_1",
      "lesson_2",
      "lesson_3",
    ]);
    expect(result.value.modules[1]!.lessons[0]!.moduleId).toBe("module_2");
  });

  it("dates sessions continuously across module boundaries", () => {
    const result = materialise();
    if (!result.ok) throw new Error("expected ok");
    const days = result.value.modules.flatMap((m) => m.lessons.map((l) => l.scheduledFor));
    expect(days).toEqual(["2026-09-01", "2026-09-03", "2026-09-06", "2026-09-08"]);
  });

  it("numbers lessons within their own module", () => {
    const result = materialise();
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.modules[0]!.lessons.map((l) => l.order)).toEqual([0, 1, 2]);
    expect(result.value.modules[1]!.lessons.map((l) => l.order)).toEqual([0]);
  });

  it("starts every program as a draft with planned lessons", () => {
    const result = materialise();
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.status).toBe("draft");
    expect(result.value.modules.flatMap((m) => m.lessons).every((l) => l.status === "planned")).toBe(
      true,
    );
  });

  it("carries the skill-on-skill lineage", () => {
    const result = materialise({
      basedOn: ["program_prev" as never],
      continuation: "deepen",
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.basedOn).toEqual(["program_prev"]);
    expect(result.value.continuation).toBe("deepen");
  });

  it("rejects an unusable intensity", () => {
    expect(
      materialise({ schedule: { ...schedule, intensity: { ...schedule.intensity, weeks: 0 } } }),
    ).toEqual({ ok: false, error: "weeks-out-of-range" });
  });

  it("rejects a plan with no lessons at all", () => {
    expect(
      materialise({ draft: { ...draft, modules: [{ title: "Пусто", objective: "", lessons: [] }] } }),
    ).toEqual({ ok: false, error: "empty-plan" });
    expect(materialise({ draft: { ...draft, modules: [] } })).toEqual({
      ok: false,
      error: "empty-plan",
    });
  });

  it("lets a long plan run past the committed period rather than dropping lessons", () => {
    const long: ProgramDraft = {
      ...draft,
      modules: [{ title: "М", objective: "", lessons: Array.from({ length: 5 }, (_, i) => lesson(`L${i}`)) }],
    };
    const result = materialise({
      draft: long,
      schedule: { ...schedule, intensity: { weeks: 1, sessionsPerWeek: 2, minutesPerSession: 45 } },
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.modules[0]!.lessons).toHaveLength(5);
    expect(result.value.modules[0]!.lessons.at(-1)!.scheduledFor).toBe("2026-09-15");
  });
});

describe("rescheduleProgram", () => {
  it("re-dates sessions and keeps ids", () => {
    const program = makeProgram({
      modules: [
        {
          id: "module_1" as never,
          order: 0,
          title: "М",
          objective: "",
          lessons: [
            {
              id: "lesson_1" as never,
              moduleId: "module_1" as never,
              order: 0,
              title: "L1",
              objective: "",
              estimatedMinutes: 45,
              scheduledFor: "2026-09-01" as CalendarDay,
              status: "done",
            },
            {
              id: "lesson_2" as never,
              moduleId: "module_1" as never,
              order: 1,
              title: "L2",
              objective: "",
              estimatedMinutes: 45,
              scheduledFor: "2026-09-03" as CalendarDay,
              status: "planned",
            },
          ],
        },
      ],
    });

    const later = instantOf("2026-08-25T10:00:00Z");
    const result = rescheduleProgram(
      program,
      { startDay: "2026-10-05" as CalendarDay, intensity: { weeks: 2, sessionsPerWeek: 2, minutesPerSession: 60 } },
      later,
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.modules[0]!.lessons.map((l) => [l.id, l.scheduledFor, l.status])).toEqual([
      ["lesson_1", "2026-10-05", "done"],
      ["lesson_2", "2026-10-09", "planned"],
    ]);
    expect(result.value.updatedAt).toBe(later);
  });

  it("rejects an unusable intensity", () => {
    expect(
      rescheduleProgram(
        makeProgram(),
        { startDay: "2026-10-05" as CalendarDay, intensity: { weeks: 2, sessionsPerWeek: 9, minutesPerSession: 60 } },
        T0,
      ),
    ).toEqual({ ok: false, error: "sessions-out-of-range" });
  });
});
