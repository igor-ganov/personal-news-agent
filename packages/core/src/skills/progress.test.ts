import { describe, expect, it } from "vitest";
import type { LessonId, ModuleId, TopicId } from "../model/ids.js";
import type { LessonStatus, SkillProgram } from "../model/skill.js";
import { makeLessonPlan, makeModule, makeProgram, T0 } from "../testing/builders.js";
import type { CalendarDay } from "../time/instant.js";
import type { ProgramMap } from "./lineage.js";
import {
  dueLessons,
  findLesson,
  findProgramOfLesson,
  nextLesson,
  programLessons,
  programProgress,
  setLessonStatus,
  upcomingLessons,
} from "./progress.js";

const lesson = (id: string, order: number, moduleId: string, status: LessonStatus, day: string) =>
  makeLessonPlan({
    id: id as LessonId,
    moduleId: moduleId as ModuleId,
    order,
    title: id,
    status,
    scheduledFor: day as CalendarDay,
  });

const program = (over: Partial<SkillProgram> = {}): SkillProgram =>
  makeProgram({
    modules: [
      makeModule({
        id: "m2" as ModuleId,
        order: 1,
        lessons: [lesson("l3", 0, "m2", "planned", "2026-09-08")],
      }),
      makeModule({
        id: "m1" as ModuleId,
        order: 0,
        lessons: [
          lesson("l1", 0, "m1", "done", "2026-09-01"),
          lesson("l2", 1, "m1", "ready", "2026-09-03"),
        ],
      }),
    ],
    ...over,
  });

describe("programLessons", () => {
  it("orders lessons by module order, then lesson order", () => {
    expect(programLessons(program()).map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("finds a lesson by id", () => {
    expect(findLesson(program(), "l2" as LessonId)?.title).toBe("l2");
    expect(findLesson(program(), "ghost" as LessonId)).toBeUndefined();
  });

  it("finds the program a lesson belongs to", () => {
    const programs: ProgramMap = { [program().id]: program() };
    expect(findProgramOfLesson(programs, "l2" as LessonId)?.id).toBe("program_1");
    expect(findProgramOfLesson(programs, "ghost" as LessonId)).toBeUndefined();
  });
});

describe("programProgress", () => {
  it("counts done and ready sessions", () => {
    expect(programProgress(program())).toEqual({ total: 3, done: 1, ready: 1, ratio: 1 / 3 });
  });

  it("reports zero for an empty program", () => {
    expect(programProgress(makeProgram({ modules: [] }))).toEqual({
      total: 0,
      done: 0,
      ready: 0,
      ratio: 0,
    });
  });
});

describe("scheduling views", () => {
  it("picks the first unfinished session as next", () => {
    expect(nextLesson(program())?.id).toBe("l2");
  });

  it("returns nothing to do once everything is done", () => {
    const finished = program({
      modules: [makeModule({ lessons: [lesson("l1", 0, "m1", "done", "2026-09-01")] })],
    });
    expect(nextLesson(finished)).toBeUndefined();
  });

  it("lists unfinished sessions that are already due", () => {
    expect(dueLessons(program(), "2026-09-03" as CalendarDay).map((l) => l.id)).toEqual(["l2"]);
    expect(dueLessons(program(), "2026-09-30" as CalendarDay).map((l) => l.id)).toEqual(["l2", "l3"]);
  });

  it("lists what is coming up, capped", () => {
    expect(upcomingLessons(program(), "2026-09-01" as CalendarDay).map((l) => l.id)).toEqual([
      "l2",
      "l3",
    ]);
    expect(upcomingLessons(program(), "2026-09-01" as CalendarDay, 1).map((l) => l.id)).toEqual(["l2"]);
  });
});

describe("setLessonStatus", () => {
  it("rejects an unknown lesson", () => {
    expect(setLessonStatus(program(), "ghost" as LessonId, "done", T0)).toEqual({
      ok: false,
      error: "unknown-lesson",
    });
  });

  it("marks a session done and makes the program active", () => {
    const result = setLessonStatus(program(), "l2" as LessonId, "done", T0);
    if (!result.ok) throw new Error("expected ok");
    expect(findLesson(result.value, "l2" as LessonId)?.status).toBe("done");
    expect(result.value.status).toBe("active");
    expect(result.value.updatedAt).toBe(T0);
  });

  it("completes the program when the last session is done", () => {
    const nearlyDone = program({
      modules: [
        makeModule({
          lessons: [
            lesson("l1", 0, "m1", "done", "2026-09-01"),
            lesson("l2", 1, "m1", "planned", "2026-09-03"),
          ],
        }),
      ],
      status: "active",
    });
    const result = setLessonStatus(nearlyDone, "l2" as LessonId, "done", T0);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.status).toBe("completed");
  });

  it("reopens a completed program when a session is un-done", () => {
    const completed = program({
      modules: [
        makeModule({
          lessons: [
            lesson("l1", 0, "m1", "done", "2026-09-01"),
            lesson("l2", 1, "m1", "done", "2026-09-03"),
          ],
        }),
      ],
      status: "completed",
    });
    const result = setLessonStatus(completed, "l2" as LessonId, "planned", T0);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.status).toBe("active");
  });

  it("leaves an archived program archived", () => {
    const archived = program({ status: "archived" });
    const result = setLessonStatus(archived, "l2" as LessonId, "done", T0);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.status).toBe("archived");
  });
});
