import { createMockProvider, type ContentProvider } from "@pna/agent";
import { emptyState, fixedClock, instantOf, sequentialIds, type AppState } from "@pna/core";
import { createSecretStore, createStateRepository, memoryStore } from "@pna/storage";
import type { AppContext } from "../container.js";
import type { JobsGateway } from "../ports/jobs.js";
import { createStore } from "../store.js";
import { createTaskTracker } from "../tasks.js";
import type { Generation } from "../usecases/jobs.js";

export const T0 = instantOf("2026-08-22T10:00:00Z");

export interface Harness {
  readonly ctx: AppContext;
  state(): AppState;
}

export interface HarnessOptions {
  readonly provider?: ContentProvider;
  readonly state?: AppState;
  readonly now?: typeof T0;
  /** Present only when the test is about work that runs on a server. */
  readonly jobs?: JobsGateway;
}

/** An app context with everything deterministic: fixed clock, counted ids, no network. */
export const harness = (overrides: HarnessOptions = {}): Harness => {
  const store = createStore(overrides.state ?? emptyState());
  const ctx: AppContext = {
    store,
    deps: {
      clock: fixedClock(overrides.now ?? T0),
      ids: sequentialIds(),
      provider: overrides.provider ?? createMockProvider(),
      repository: createStateRepository(memoryStore()),
      secrets: createSecretStore(memoryStore()),
      tasks: createTaskTracker(),
      account: null,
      jobs: overrides.jobs ?? null,
    },
  };
  return { ctx, state: () => store.getState() };
};

/**
 * Unwraps a generation that ran here rather than on a server.
 *
 * Every use-case now answers "produced" or "queued"; a test with no jobs
 * gateway is always in the first case, and saying so once keeps the assertions
 * about the value itself.
 */
export const produced = <T>(generation: Generation<T>): T => {
  if (generation.kind !== "ready") throw new Error("ожидался готовый результат, а не задание");
  return generation.value;
};

/** A provider whose every method fails — for testing the unhappy path. */
export const failingProvider = (
  error = { kind: "network" as const, message: "нет сети" },
): ContentProvider => ({
  id: "failing",
  discoverSources: async () => ({ ok: false, error }),
  buildDigest: async () => ({ ok: false, error }),
  draftProgram: async () => ({ ok: false, error }),
  writeLesson: async () => ({ ok: false, error }),
  buildQuiz: async () => ({ ok: false, error }),
});
