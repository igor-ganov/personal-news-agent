import { createMockProvider, type ContentProvider } from "@pna/agent";
import { emptyState, fixedClock, instantOf, sequentialIds, type AppState } from "@pna/core";
import { createSecretStore, createStateRepository, memoryStore } from "@pna/storage";
import type { AppContext } from "../container.js";
import { createStore } from "../store.js";
import { createTaskTracker } from "../tasks.js";

export const T0 = instantOf("2026-08-22T10:00:00Z");

export interface Harness {
  readonly ctx: AppContext;
  state(): AppState;
}

/** An app context with everything deterministic: fixed clock, counted ids, no network. */
export const harness = (
  overrides: { provider?: ContentProvider; state?: AppState; now?: typeof T0 } = {},
): Harness => {
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
    },
  };
  return { ctx, state: () => store.getState() };
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
