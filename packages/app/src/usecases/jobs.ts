import {
  runAgentJob,
  type AgentJobInputs,
  type AgentJobKind,
  type AgentJobRequest,
  type AgentJobResults,
} from "@pna/agent/jobs";
import {
  calendarDay,
  digestId,
  err,
  findProgramOfLesson,
  instantOf,
  lessonId as toLessonId,
  mergeDiscoveredSources,
  ok,
  programId as toProgramId,
  programLessons,
  quizId as toQuizId,
  quizOfLesson,
  setLessonStatus,
  sourceId as toSourceId,
  sourcesOfTopic,
  topicId as toTopicId,
  type ContinuationMode,
  type Digest,
  type DigestPeriod,
  type LessonContent,
  type LessonId,
  type ProgramDraft,
  type ProgramId,
  type Quiz,
  type Result,
  type Schedule,
  type SourceId,
  type TopicId,
  type Window,
} from "@pna/core";
import type { AppContext } from "../container.js";
import { appError, type AppError } from "../errors.js";
import type { JobStatus, JobView } from "../ports/jobs.js";
import type { TaskState } from "../tasks.js";
import { DIGEST_HISTORY } from "./digests.js";

/**
 * What the app needs to remember about a generation while it is running, so
 * that whichever device sees the answer knows where it belongs.
 *
 * It travels with the job and comes back as JSON, which is why every field is
 * a plain value and why it is re-checked on the way in — the copy that returns
 * has been through a database and a wire.
 */
export interface JobMetas {
  readonly sources: { readonly topicId: TopicId };
  readonly digest: {
    readonly topicId: TopicId;
    readonly period: DigestPeriod;
    readonly window: Window;
    readonly sourceIds: readonly SourceId[];
  };
  readonly program: {
    readonly topicId: TopicId;
    readonly intent: string;
    readonly schedule: Schedule;
    readonly basedOn: readonly ProgramId[];
    readonly continuation: ContinuationMode;
  };
  readonly lesson: { readonly lessonId: LessonId };
  readonly quiz: { readonly lessonId: LessonId };
}

/** A request the app is about to run — locally or on the server. */
export interface GenerationRequest<K extends AgentJobKind> {
  readonly key: string;
  readonly kind: K;
  readonly input: AgentJobInputs[K];
  readonly meta: JobMetas[K];
}

/**
 * The two ways a generation can end for the caller: it produced something here
 * and now, or it is running somewhere else and the screen should watch the key.
 */
export type Generation<T> =
  | { readonly kind: "ready"; readonly value: T }
  | { readonly kind: "queued"; readonly jobId: string };

/* ------------------------------------------------------------- meta guards -- */

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const parseWindow = (value: unknown): Window | null => {
  const raw = record(value);
  const from = str(raw?.from);
  const to = str(raw?.to);
  return from && to ? { from: instantOf(from), to: instantOf(to) } : null;
};

const PERIODS: readonly DigestPeriod[] = ["day", "week", "month", "year"];
const MODES: readonly ContinuationMode[] = ["fresh", "deepen", "extend", "apply"];

const number = (value: unknown): number | null => (typeof value === "number" ? value : null);

const parseSchedule = (value: unknown): Schedule | null => {
  const raw = record(value);
  const intensity = record(raw?.intensity);
  const startDay = str(raw?.startDay);
  const weeks = number(intensity?.weeks);
  const sessionsPerWeek = number(intensity?.sessionsPerWeek);
  const minutesPerSession = number(intensity?.minutesPerSession);
  if (!startDay || weeks === null || sessionsPerWeek === null || minutesPerSession === null)
    return null;

  return {
    startDay: calendarDay(startDay),
    intensity: { weeks, sessionsPerWeek, minutesPerSession },
  };
};

type MetaParsers = { [K in AgentJobKind]: (raw: unknown) => JobMetas[K] | null };

const META_PARSERS: MetaParsers = {
  sources: (raw) => {
    const topic = str(record(raw)?.topicId);
    return topic ? { topicId: toTopicId(topic) } : null;
  },
  digest: (raw) => {
    const meta = record(raw);
    const topic = str(meta?.topicId);
    const period = PERIODS.find((p) => p === meta?.period);
    const window = parseWindow(meta?.window);
    if (!topic || !period || !window) return null;
    return {
      topicId: toTopicId(topic),
      period,
      window,
      sourceIds: strings(meta?.sourceIds).map(toSourceId),
    };
  },
  program: (raw) => {
    const meta = record(raw);
    const topic = str(meta?.topicId);
    const schedule = parseSchedule(meta?.schedule);
    const continuation = MODES.find((m) => m === meta?.continuation);
    if (!topic || !schedule || !continuation) return null;
    return {
      topicId: toTopicId(topic),
      intent: str(meta?.intent) ?? "",
      schedule,
      basedOn: strings(meta?.basedOn).map(toProgramId),
      continuation,
    };
  },
  lesson: (raw) => {
    const lesson = str(record(raw)?.lessonId);
    return lesson ? { lessonId: toLessonId(lesson) } : null;
  },
  quiz: (raw) => {
    const lesson = str(record(raw)?.lessonId);
    return lesson ? { lessonId: toLessonId(lesson) } : null;
  },
};

/* ----------------------------------------------------------- result guards -- */

const hasArray = (value: Record<string, unknown> | null, field: string): boolean =>
  Array.isArray(value?.[field]);

type ResultGuards = { [K in AgentJobKind]: (raw: unknown) => boolean };

/**
 * A result comes back as JSON written by a server. It was produced by the same
 * provider code the app would have run itself, so this is a sanity check on the
 * shape rather than a second validation of the model's output.
 */
const RESULT_GUARDS: ResultGuards = {
  sources: (raw) => Array.isArray(raw),
  digest: (raw) => typeof record(raw)?.headline === "string" && hasArray(record(raw), "sections"),
  program: (raw) => typeof record(raw)?.title === "string" && hasArray(record(raw), "modules"),
  lesson: (raw) => typeof record(raw)?.body === "string" && hasArray(record(raw), "keyPoints"),
  quiz: (raw) => hasArray(record(raw), "questions"),
};

/* ---------------------------------------------------------------- appliers -- */

/**
 * Where a finished result lands.
 *
 * `true` means the app is done with the job and it can be forgotten. `false`
 * means a screen still has to pick it up — a program plan is the user's to edit
 * before it becomes anything, so it waits in the tracker until they do.
 */
type Appliers = {
  [K in AgentJobKind]: (ctx: AppContext, meta: JobMetas[K], value: AgentJobResults[K]) => boolean;
};

const APPLIERS: Appliers = {
  sources: (ctx, meta, candidates) => {
    const state = ctx.store.getState();
    const outcome = mergeDiscoveredSources({
      existing: sourcesOfTopic(state.sources, meta.topicId),
      candidates: [...candidates],
      topicId: meta.topicId,
      ids: ctx.deps.ids,
      now: ctx.deps.clock.now(),
    });

    if (outcome.added.length > 0 || outcome.refreshed.length > 0) {
      ctx.store.dispatch({
        type: "sources/upsert-many",
        sources: [...outcome.refreshed, ...outcome.added],
      });
    }
    return true;
  },

  digest: (ctx, meta, draft) => {
    const digest: Digest = {
      id: digestId(ctx.deps.ids.next("digest")),
      topicId: meta.topicId,
      period: meta.period,
      window: meta.window,
      generatedAt: ctx.deps.clock.now(),
      headline: draft.headline,
      summary: draft.summary,
      sections: draft.sections,
      sourceIds: meta.sourceIds,
    };
    ctx.store.dispatch({ type: "digests/upsert", digest });
    ctx.store.dispatch({ type: "digests/prune", keepPerPeriod: DIGEST_HISTORY });
    return true;
  },

  program: () => false,

  lesson: (ctx, meta, draft) => {
    const now = ctx.deps.clock.now();
    const content: LessonContent = { ...draft, lessonId: meta.lessonId, generatedAt: now };
    ctx.store.dispatch({ type: "lessons/content", content });

    const program = findProgramOfLesson(ctx.store.getState().programs, meta.lessonId);
    const lesson = program && programLessons(program).find((l) => l.id === meta.lessonId);
    if (program && lesson) {
      // Re-reading a session the user already finished must not un-finish it.
      const status = lesson.status === "done" ? "done" : "ready";
      const marked = setLessonStatus(program, meta.lessonId, status, now);
      if (marked.ok) ctx.store.dispatch({ type: "programs/upsert", program: marked.value });
    }
    return true;
  },

  quiz: (ctx, meta, draft) => {
    const existing = quizOfLesson(ctx.store.getState(), meta.lessonId);
    const quiz: Quiz = {
      id: existing?.id ?? toQuizId(ctx.deps.ids.next("quiz")),
      lessonId: meta.lessonId,
      questions: draft.questions,
    };
    ctx.store.dispatch({ type: "quizzes/upsert", quiz });
    return true;
  },
};

/**
 * A plan that finished generating and is waiting for its screen.
 *
 * It carries what it was asked for as well as what came back: the plan editor
 * needs the schedule to commit, and after a restart — or on a second device —
 * nothing else remembers it.
 */
export interface HeldPlan {
  readonly draft: ProgramDraft;
  readonly request: JobMetas["program"];
}

export const parseJobMeta = <K extends AgentJobKind>(kind: K, raw: unknown): JobMetas[K] | null =>
  META_PARSERS[kind](raw);

/**
 * Reads a held plan out of a task's state, if that is what is sitting there.
 *
 * `isProgramDraft` is the guard that lets the plan back into the domain; it
 * checks the shape the plan editor actually walks.
 */
const isModuleDraft = (value: unknown): boolean => {
  const module = record(value);
  return typeof module?.title === "string" && Array.isArray(module.lessons);
};

const isProgramDraft = (value: unknown): value is ProgramDraft => {
  const draft = record(value);
  return (
    typeof draft?.title === "string" &&
    typeof draft.goal === "string" &&
    Array.isArray(draft.modules) &&
    draft.modules.every(isModuleDraft)
  );
};

export const heldPlan = (state: TaskState): HeldPlan | null => {
  const held = record(state.result);
  if (!held || !isProgramDraft(held.draft)) return null;

  const meta = META_PARSERS.program(held.request);
  return meta ? { draft: held.draft, request: meta } : null;
};

/**
 * Applies a result to the state document.
 *
 * The pairing of kind, meta and value is checked here rather than trusted: this
 * is the point where data that spent time on a server re-enters the domain.
 */
export const applyJobResult = (
  ctx: AppContext,
  kind: AgentJobKind,
  rawMeta: unknown,
  rawResult: unknown,
): "applied" | "held" | "unusable" => {
  const meta = META_PARSERS[kind](rawMeta);
  if (!meta || !RESULT_GUARDS[kind](rawResult)) return "unusable";

  const apply = APPLIERS[kind] as (ctx: AppContext, meta: unknown, value: unknown) => boolean;
  return apply(ctx, meta, rawResult) ? "applied" : "held";
};

/* -------------------------------------------------------------- generation -- */

const isAgentJobKind = (value: string): value is AgentJobKind => value in APPLIERS;

const submissionOf = <K extends AgentJobKind>(request: GenerationRequest<K>) => ({
  key: request.key,
  kind: request.kind,
  input: request.input,
  meta: request.meta,
});

/**
 * Runs a generation the way this build can.
 *
 * Signed in, the work goes to the server and survives the app being closed —
 * that is the whole point of a job. Without an account there is nowhere to put
 * it, so the same call runs against the local provider and the app behaves
 * exactly as it always did, only without the safety net.
 */
export const runGeneration = async <K extends AgentJobKind>(
  ctx: AppContext,
  request: GenerationRequest<K>,
): Promise<Result<Generation<AgentJobResults[K]>, AppError>> => {
  const tasks = ctx.deps.tasks;
  const gateway = ctx.deps.jobs;
  const previous = tasks.get(request.key);

  // The same key started twice costs two generations and answers once.
  if (previous.status === "running") return ok({ kind: "queued", jobId: previous.jobId ?? "" });

  if (gateway) {
    // A finished job under the same key would keep coming back on every sync.
    if (previous.jobId) await gateway.dismiss(previous.jobId);

    tasks.adopt(request.key, { status: "running" });
    const submitted = await gateway.submit(submissionOf(request));
    if (!submitted.ok) {
      tasks.adopt(request.key, { status: "error", error: submitted.error.message });
      return submitted;
    }

    tasks.adopt(request.key, { status: "running", jobId: submitted.value.id });
    return ok({ kind: "queued", jobId: submitted.value.id });
  }

  tasks.adopt(request.key, { status: "running" });

  // `kind` and `input` are correlated by construction; indexing the union here
  // is what loses that for the compiler, so the pairing is restated once.
  const call = { kind: request.kind, input: request.input } as AgentJobRequest;
  const produced = await runAgentJob(ctx.deps.provider, call);
  if (!produced.ok) {
    tasks.adopt(request.key, { status: "error", error: produced.error.message });
    return err(produced.error);
  }

  const value = produced.value as AgentJobResults[K];
  const outcome = applyJobResult(ctx, request.kind, request.meta, value);
  // A held result — a plan — waits under the key exactly as a server job's
  // would, so the screen reads it the same way whichever path produced it.
  tasks.adopt(request.key, {
    status: "done",
    ...(outcome === "held" ? { result: { draft: value, request: request.meta } } : {}),
  });
  return ok({ kind: "ready", value });
};

/* -------------------------------------------------------------------- sync -- */

const RUNNING: readonly JobStatus[] = ["queued", "running"];

/** Whether folding this job changed the state document. */
const foldJob = async (ctx: AppContext, job: JobView): Promise<boolean> => {
  const tasks = ctx.deps.tasks;

  if (RUNNING.includes(job.status)) {
    tasks.adopt(job.key, { status: "running", jobId: job.id });
    return false;
  }

  if (job.status === "failed") {
    tasks.adopt(job.key, {
      status: "error",
      error: job.error?.message ?? "Не получилось",
      jobId: job.id,
    });
    return false;
  }

  if (!isAgentJobKind(job.kind)) return false;

  const outcome = applyJobResult(ctx, job.kind, job.meta, job.result);
  if (outcome === "held") {
    // The only held result is a plan, and it needs what it was asked for.
    tasks.adopt(job.key, {
      status: "done",
      jobId: job.id,
      result: { draft: job.result, request: job.meta },
    });
    return false;
  }

  tasks.adopt(job.key, {
    status: outcome === "applied" ? "done" : "error",
    ...(outcome === "applied" ? {} : { error: "Ответ сервера не подошёл, попробуйте ещё раз" }),
  });
  await ctx.deps.jobs?.dismiss(job.id);
  return outcome === "applied";
};

/**
 * Brings the app's picture of in-flight work up to date with the server's.
 *
 * This is what makes a request visible on a second device and what delivers a
 * lecture generated while the app was closed. Results that belong in the state
 * document are applied here, once, and the job is then forgotten.
 */
export const syncJobs = async (ctx: AppContext): Promise<Result<number, AppError>> => {
  const gateway = ctx.deps.jobs;
  if (!gateway) return ok(0);

  const listed = await gateway.list();
  if (!listed.ok) return listed;

  let applied = 0;
  for (const job of listed.value) if (await foldJob(ctx, job)) applied += 1;

  // The job is gone once it is applied, so the other devices will never see it.
  // Pushing here is what carries a lecture generated on this phone to the rest.
  if (applied > 0) await ctx.deps.account?.sync();

  return ok(listed.value.length);
};

/** Drops a job the user has dealt with: a plan they discarded, an error they read. */
export const dismissJob = async (ctx: AppContext, key: string): Promise<Result<true, AppError>> => {
  const state = ctx.deps.tasks.get(key);
  ctx.deps.tasks.reset(key);
  if (!state.jobId || !ctx.deps.jobs) return ok(true);
  return ctx.deps.jobs.dismiss(state.jobId);
};

/** Whether any tracked task is still waiting on a result. */
export const hasRunningTasks = (ctx: AppContext): boolean =>
  ctx.deps.tasks.keys().some((key) => ctx.deps.tasks.isRunning(key));

export interface JobPollingOptions {
  /** How often to look while something is running. */
  readonly activeMs?: number;
  /** How often to look otherwise — enough to notice another device's work. */
  readonly idleMs?: number;
  readonly onError?: (error: AppError) => void;
}

/**
 * Keeps asking the server what is happening, faster while something is.
 *
 * Polling rather than a socket: the app spends most of its life closed, the
 * answer takes minutes, and a phone that wakes up needs the current picture
 * once, not a stream it missed.
 */
export const startJobPolling = (ctx: AppContext, options: JobPollingOptions = {}): (() => void) => {
  const activeMs = options.activeMs ?? 5_000;
  const idleMs = options.idleMs ?? 45_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const result = await syncJobs(ctx);
    if (!result.ok) options.onError?.(result.error);
    if (stopped) return;
    timer = setTimeout(() => void tick(), hasRunningTasks(ctx) ? activeMs : idleMs);
  };

  void tick();

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
};

export const jobsUnavailable = (): AppError =>
  appError("offline", "Генерация на сервере недоступна: войдите в аккаунт");
