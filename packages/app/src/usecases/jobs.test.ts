import {
  calendarDay,
  ok,
  programLessons,
  quizOfLesson,
  type ProgramDraft,
  type Result,
} from "@pna/core";
import { describe, expect, it } from "vitest";
import { harness, T0 } from "../testing/harness.js";
import type { AppError } from "../errors.js";
import type { JobSubmission, JobView, JobsGateway } from "../ports/jobs.js";
import { addTopic } from "./topics.js";
import { commitProgram, draftProgram, generateLesson, programTaskKey, lessonTaskKey } from "./skills.js";
import { dismissJob, heldPlan, syncJobs } from "./jobs.js";

const plan: ProgramDraft = {
  title: "План",
  goal: "цель",
  rationale: "почему",
  modules: [
    {
      title: "Модуль",
      objective: "задача",
      lessons: [{ title: "Занятие", objective: "понять", estimatedMinutes: 45 }],
    },
  ],
};

/**
 * A server that accepts work and hands back whatever the test says it holds.
 * It is deliberately dumb: the point of these tests is what the app does with
 * a job it did not start itself.
 */
const fakeJobs = (initial: JobView[] = []) => {
  const submitted: JobSubmission[] = [];
  const dismissed: string[] = [];
  let jobs = [...initial];
  let counter = 0;

  const gateway: JobsGateway = {
    async list(): Promise<Result<readonly JobView[], AppError>> {
      return ok(jobs);
    },
    async submit(submission) {
      submitted.push(submission);
      counter += 1;
      const job: JobView = {
        id: `job_${counter}`,
        key: submission.key,
        kind: submission.kind,
        status: "queued",
        meta: submission.meta,
        result: null,
        error: null,
      };
      jobs = [...jobs, job];
      return ok(job);
    },
    async dismiss(id) {
      dismissed.push(id);
      jobs = jobs.filter((job) => job.id !== id);
      return ok(true);
    },
    async credentials() {
      return ok({ configured: true, ownKey: true, model: "claude-opus-5" });
    },
    async setCredentials(_apiKey, model) {
      return ok({ configured: true, ownKey: true, model });
    },
  };

  return {
    gateway,
    submitted,
    dismissed,
    set(next: JobView[]) {
      jobs = next;
    },
  };
};

const withTopic = (jobs?: JobsGateway) => {
  const h = harness(jobs ? { jobs } : {});
  const created = addTopic(h.ctx, { parentId: null, title: "Инференс" });
  if (!created.ok) throw new Error("expected ok");
  return { ...h, topicId: created.value.id };
};

describe("runGeneration with a server", () => {
  it("queues the work instead of running it here", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);

    const result = await draftProgram(ctx, {
      topicId,
      intent: "разобраться",
      schedule: { startDay: calendarDay(T0), intensity: { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 } },
      basedOn: [],
      continuation: "fresh",
    });

    if (!result.ok) throw new Error("expected ok");
    expect(result.value).toEqual({ kind: "queued", jobId: "job_1" });
    expect(server.submitted[0]?.kind).toBe("program");
    expect(ctx.deps.tasks.get(programTaskKey(topicId))).toMatchObject({
      status: "running",
      jobId: "job_1",
    });
  });

  it("shows work another device started, before any result exists", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);

    server.set([
      { id: "job_9", key, kind: "program", status: "running", meta: {}, result: null, error: null },
    ]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.isRunning(key)).toBe(true);
  });

  it("surfaces a failure raised while the app was closed", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);

    server.set([
      {
        id: "job_9",
        key,
        kind: "program",
        status: "failed",
        meta: {},
        result: null,
        error: { kind: "rate-limit", message: "Превышен лимит запросов" },
      },
    ]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.get(key)).toMatchObject({
      status: "error",
      error: "Превышен лимит запросов",
    });
  });

  it("keeps a failure until the user dismisses it", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);

    server.set([
      {
        id: "job_9",
        key,
        kind: "program",
        status: "failed",
        meta: {},
        result: null,
        error: { kind: "network", message: "Нет связи" },
      },
    ]);
    await syncJobs(ctx);
    await syncJobs(ctx);
    expect(server.dismissed).toEqual([]);

    await dismissJob(ctx, key);
    expect(server.dismissed).toEqual(["job_9"]);
    expect(ctx.deps.tasks.get(key).status).toBe("idle");
  });
});

describe("syncJobs applying results", () => {
  it("files a lecture generated elsewhere and forgets the job", async () => {
    const server = fakeJobs();
    const { ctx, state, topicId } = withTopic(server.gateway);

    const queued = await draftProgram(ctx, {
      topicId,
      intent: "разобраться",
      schedule: { startDay: calendarDay(T0), intensity: { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 } },
      basedOn: [],
      continuation: "fresh",
    });
    if (!queued.ok) throw new Error("expected ok");

    const committed = commitProgram(ctx, {
      topicId,
      draft: plan,
      schedule: { startDay: calendarDay(T0), intensity: { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 } },
      basedOn: [],
      continuation: "fresh",
    });
    if (!committed.ok) throw new Error("expected ok");

    const lessonId = programLessons(committed.value)[0]!.id;
    await generateLesson(ctx, lessonId);

    server.set([
      {
        id: "job_lesson",
        key: lessonTaskKey(lessonId),
        kind: "lesson",
        status: "done",
        meta: { lessonId },
        result: {
          keyPoints: ["раз"],
          body: "Текст лекции",
          diagrams: [],
          links: [],
          newsHooks: [],
          priorReferences: [],
        },
        error: null,
      },
    ]);
    await syncJobs(ctx);

    expect(state().lessonContent[lessonId]?.body).toBe("Текст лекции");
    expect(programLessons(state().programs[committed.value.id]!)[0]!.status).toBe("ready");
    expect(server.dismissed).toEqual(["job_lesson"]);
  });

  it("holds a program plan for the screen instead of applying it", async () => {
    const server = fakeJobs();
    const { ctx, state, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);

    server.set([
      {
        id: "job_plan",
        key,
        kind: "program",
        status: "done",
        meta: {
          topicId,
          intent: "разобраться",
          schedule: {
            startDay: calendarDay(T0),
            intensity: { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 },
          },
          basedOn: [],
          continuation: "fresh",
        },
        result: plan,
        error: null,
      },
    ]);
    await syncJobs(ctx);

    // Nothing was stored: a plan is the user's to accept.
    expect(Object.keys(state().programs)).toHaveLength(0);
    expect(ctx.deps.tasks.get(key)).toMatchObject({ status: "done", jobId: "job_plan" });
    expect(server.dismissed).toEqual([]);

    // The screen gets both halves back: the plan, and what was asked for.
    const held = heldPlan(ctx.deps.tasks.get(key));
    expect(held?.draft).toEqual(plan);
    expect(held?.request.schedule.intensity.minutesPerSession).toBe(45);
  });

  it("refuses a result whose meta does not describe anything", async () => {
    const server = fakeJobs();
    const { ctx, state } = withTopic(server.gateway);

    server.set([
      {
        id: "job_bad",
        key: "quiz:ghost",
        kind: "quiz",
        status: "done",
        meta: {},
        result: { questions: [] },
        error: null,
      },
    ]);
    await syncJobs(ctx);

    expect(Object.keys(state().quizzes)).toHaveLength(0);
    expect(ctx.deps.tasks.get("quiz:ghost").status).toBe("error");
    expect(quizOfLesson(state(), "ghost" as never)).toBeUndefined();
  });
});
