import {
  calendarDay,
  err,
  instantOf,
  ok,
  programLessons,
  quizOfLesson,
  STARTED_PROGRESS,
  type ProgramDraft,
  type Result,
} from "@pna/core";
import { createMockProvider, type SuggestInput } from "@pna/agent";
import { createKnownKeysStore, createSessionStore } from "@pna/auth";
import { fixedClock } from "@pna/core";
import { createOwnedRepository, memoryStore } from "@pna/storage";
import { fakeAuthClient } from "../testing/fake-auth.js";
import { createAccountService } from "./account.js";
import { describe, expect, it, vi } from "vitest";
import { harness, T0 } from "../testing/harness.js";
import { appError, type AppError } from "../errors.js";
import type { JobSubmission, JobView, JobsGateway } from "../ports/jobs.js";
import { addTopic } from "./topics.js";
import { commitProgram, draftProgram, generateLesson, programTaskKey, lessonTaskKey } from "./skills.js";
import {
  describeJobSyncError,
  dismissJob,
  heldPlan,
  pendingRequest,
  startJobPolling,
  syncJobs,
} from "./jobs.js";

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
  const asked: SuggestInput[] = [];
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
    async suggest(request) {
      asked.push(request);
      return ok([{ title: "С сервера", summary: "", brief: "", focus: [] }]);
    },
    setup: async () => ok({ kind: "skill", weeks: 1, sessionsPerWeek: 1, minutesPerSession: 15, note: "" }),
  };

  return {
    gateway,
    submitted,
    dismissed,
    asked,
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

describe("syncJobs before anyone has signed in", () => {
  // The poller starts with the app, and on a first launch that is before the
  // passkey prompt is answered: the server can only say "who are you?", which
  // the screen used to show as an expired session.
  it("leaves the server alone and reports nothing wrong", async () => {
    const asked: string[] = [];
    const gateway: JobsGateway = {
      ...fakeJobs().gateway,
      async list() {
        asked.push("list");
        return err(appError("unauthorized", "Сессия истекла — войдите снова"));
      },
    };
    const h = harness({ jobs: gateway });
    const kv = memoryStore();
    const signedOut = createAccountService({
      client: fakeAuthClient().client,
      sessions: createSessionStore(kv, fixedClock(T0)),
      keys: createKnownKeysStore(kv),
      repository: createOwnedRepository(kv),
      store: h.ctx.store,
    });
    const ctx = { ...h.ctx, deps: { ...h.ctx.deps, account: signedOut } };

    const result = await syncJobs(ctx);

    expect(result).toEqual(ok(0));
    expect(asked).toEqual([]);
  });
});

describe("syncJobs and work that never comes back", () => {
  const request = (topicId: Parameters<typeof programTaskKey>[0]) => ({
    topicId,
    intent: "разобраться",
    schedule: {
      startDay: calendarDay(T0),
      intensity: { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 },
    },
    basedOn: [],
    continuation: "fresh" as const,
  });

  it("stops spinning when the server no longer lists the job", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);
    await draftProgram(ctx, request(topicId));

    server.set([]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.get(key)).toMatchObject({
      status: "error",
      error: "Задание потерялось на сервере, запустите заново",
    });
  });

  it("gives up on a job that has been running past the deadline", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);
    const createdAt = instantOf(Date.parse(T0) - 21 * 60_000);

    server.set([
      { id: "job_9", key, kind: "program", status: "running", meta: {}, result: null, error: null, createdAt },
    ]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.get(key)).toMatchObject({ status: "error", jobId: "job_9" });
    expect(ctx.deps.tasks.get(key).error).toContain("слишком долго");
  });

  it("remembers when a job started so the screen can show the elapsed time", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);
    const createdAt = instantOf(Date.parse(T0) - 80_000);

    server.set([
      { id: "job_9", key, kind: "program", status: "running", meta: {}, result: null, error: null, createdAt },
    ]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.get(key)).toMatchObject({ status: "running", since: createdAt });
  });
});

describe("pendingRequest", () => {
  const request = (topicId: Parameters<typeof programTaskKey>[0]) => ({
    topicId,
    intent: "разобраться",
    schedule: {
      startDay: calendarDay(T0),
      intensity: { weeks: 2, sessionsPerWeek: 3, minutesPerSession: 45 },
    },
    basedOn: [],
    continuation: "fresh" as const,
  });

  it("knows what a running plan was asked for, so the screen can show it after a restart", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    await draftProgram(ctx, request(topicId));

    const fresh = withTopic(server.gateway);
    await syncJobs(fresh.ctx);

    expect(pendingRequest("program", fresh.ctx.deps.tasks.get(programTaskKey(topicId)))).toEqual(
      request(topicId),
    );
  });

  it("keeps the request of a failed or lost plan, so retry needs no retyping", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);
    await draftProgram(ctx, request(topicId));

    server.set([]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.get(key).status).toBe("error");
    expect(pendingRequest("program", ctx.deps.tasks.get(key))).toEqual(request(topicId));
  });
});

describe("startJobPolling", () => {
  it("reports a failed look and says when the next one worked", async () => {
    const server = fakeJobs();
    let failing = true;
    const gateway: JobsGateway = {
      ...server.gateway,
      list: async () =>
        failing ? err(appError("unauthorized", "Нет доступа")) : server.gateway.list(),
    };
    const { ctx } = withTopic(gateway);
    const errors: string[] = [];
    let recovered = 0;

    const firstLook = new Promise<void>((resolve) => {
      const stop = startJobPolling(ctx, {
        activeMs: 1,
        idleMs: 1,
        onError: (error) => {
          errors.push(describeJobSyncError(error));
          failing = false;
        },
        onSuccess: () => {
          recovered += 1;
          stop();
          resolve();
        },
      });
    });
    await firstLook;

    expect(errors).toEqual(["Сессия истекла — войдите снова"]);
    expect(recovered).toBe(1);
  });

  it("looks again soon once work is handed over, not after the idle wait", async () => {
    vi.useFakeTimers();
    try {
      const server = fakeJobs();
      let looks = 0;
      const gateway: JobsGateway = { ...server.gateway, list: async () => ((looks += 1), server.gateway.list()) };
      const { ctx, topicId } = withTopic(gateway);
      const stop = startJobPolling(ctx, { activeMs: 5_000, idleMs: 45_000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(looks).toBe(1);

      // Nothing was running at the first look, so the next one was set for the idle wait.
      await draftProgram(ctx, {
        topicId,
        intent: "разобраться",
        schedule: { startDay: calendarDay(T0), intensity: { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 } },
        basedOn: [],
        continuation: "fresh",
      });
      await vi.advanceTimersByTimeAsync(5_000);
      stop();

      expect(looks).toBe(2);
    } finally {
      vi.useRealTimers();
    }
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

describe("progress of a generation", () => {
  const request = (topicId: Parameters<typeof draftProgram>[1]["topicId"]) => ({
    topicId,
    intent: "разобраться",
    schedule: { startDay: calendarDay(T0), intensity: { weeks: 1, sessionsPerWeek: 1, minutesPerSession: 45 } },
    basedOn: [],
    continuation: "fresh" as const,
  });

  it("work handed to the server reads as waiting in its queue", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);

    await draftProgram(ctx, request(topicId));

    expect(ctx.deps.tasks.get(programTaskKey(topicId)).progress?.stage).toBe("queued");
  });

  it("a running job carries what the server says it is doing", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);
    const progress = { stage: "searching", query: "vLLM", found: ["vllm.ai"], item: "", searches: 2, items: 0 };

    server.set([{ id: "job_9", key, kind: "program", status: "running", meta: {}, result: null, error: null, progress }]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.get(key).progress).toEqual(progress);
  });

  it("a running job that has not reported yet reads as started, not as garbage", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);

    server.set([{ id: "job_9", key, kind: "program", status: "running", meta: {}, result: null, error: null, progress: "?" }]);
    await syncJobs(ctx);

    expect(ctx.deps.tasks.get(key).progress?.stage).toBe("thinking");
  });

  it("the same progress polled twice does not wake the screens", async () => {
    const server = fakeJobs();
    const { ctx, topicId } = withTopic(server.gateway);
    const key = programTaskKey(topicId);
    const progress = { stage: "writing", query: "", found: [], item: "Модуль 1", searches: 0, items: 1 };
    server.set([{ id: "job_9", key, kind: "program", status: "running", meta: {}, result: null, error: null, progress }]);
    await syncJobs(ctx);

    let wakes = 0;
    ctx.deps.tasks.subscribe(() => (wakes += 1));
    server.set([{ id: "job_9", key, kind: "program", status: "running", meta: {}, result: null, error: null, progress: { ...progress } }]);
    await syncJobs(ctx);

    expect(wakes).toBe(0);
  });

  it("work run on this device reports progress as it goes", async () => {
    const seen: (string | undefined)[] = [];
    const h = harness({
      provider: {
        ...createMockProvider(),
        draftProgram: async (input, options) => {
          options?.onProgress?.({ ...STARTED_PROGRESS, stage: "writing", item: "Модуль 1", items: 1 });
          seen.push(h.ctx.deps.tasks.get(key).progress?.item);
          return createMockProvider().draftProgram(input);
        },
      },
    });
    const created = addTopic(h.ctx, { parentId: null, title: "Инференс" });
    if (!created.ok) throw new Error("expected ok");
    const key = programTaskKey(created.value.id);

    await draftProgram(h.ctx, request(created.value.id));

    expect(seen).toEqual(["Модуль 1"]);
  });
});
