import {
  emptyState,
  randomIds,
  systemClock,
  type AppState,
  type Clock,
  type IdFactory,
} from "@pna/core";
import type { ContentProvider } from "@pna/agent";
import { createStateRepository, debouncedSaver, memoryStore, type SecretStore, type StateRepository } from "@pna/storage";
import { createSecretStore } from "@pna/storage";
import { createStore, type Store } from "./store.js";
import { createTaskTracker, type TaskTracker } from "./tasks.js";

export interface AppDeps {
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly provider: ContentProvider;
  readonly repository: StateRepository;
  readonly secrets: SecretStore;
  readonly tasks: TaskTracker;
}

export interface AppContext {
  readonly store: Store;
  readonly deps: AppDeps;
}

export interface BootstrapOptions {
  readonly provider: ContentProvider;
  readonly repository?: StateRepository;
  readonly secrets?: SecretStore;
  readonly clock?: Clock;
  readonly ids?: IdFactory;
  readonly tasks?: TaskTracker;
  readonly saveDelayMs?: number;
  readonly onError?: (error: unknown) => void;
  /** Reports a failed background write — a full quota must not pass unnoticed. */
  readonly onSaveError?: (message: string) => void;
}

export interface Bootstrapped {
  readonly context: AppContext;
  /** Non-fatal problem while loading — the app starts empty and says why. */
  readonly loadWarning: string | null;
  /** Persists any pending write immediately; call before the app is backgrounded. */
  flush(): Promise<void>;
}

/**
 * Builds the running application: loads persisted state, wires the store to a
 * debounced writer, and hands back the context every use-case takes.
 *
 * A corrupt or unreadable document does not stop the app — it starts empty and
 * reports the reason, because refusing to launch would strand the user with no
 * way to fix anything.
 */
export const bootstrap = async (options: BootstrapOptions): Promise<Bootstrapped> => {
  const repository = options.repository ?? createStateRepository(memoryStore());
  const secrets = options.secrets ?? createSecretStore(memoryStore());

  const loaded = await repository.load();
  const initial: AppState = loaded.ok && loaded.value ? loaded.value : emptyState();
  const loadWarning = loaded.ok ? null : loaded.error.message;

  const store = createStore(initial, options.onError);
  const saver = debouncedSaver(repository, options.saveDelayMs ?? 500, {
    ...(options.onSaveError
      ? { onError: (error) => options.onSaveError?.(error.message) }
      : {}),
  });
  store.subscribe((state) => saver.save(state));

  const context: AppContext = {
    store,
    deps: {
      clock: options.clock ?? systemClock,
      ids: options.ids ?? randomIds(),
      provider: options.provider,
      repository,
      secrets,
      tasks: options.tasks ?? createTaskTracker(),
    },
  };

  return {
    context,
    loadWarning,
    async flush() {
      await saver.flush();
    },
  };
};
