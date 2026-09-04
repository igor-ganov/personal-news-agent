import {
  emptyState,
  randomIds,
  systemClock,
  type AppState,
  type Clock,
  type IdFactory,
} from "@pna/core";
import type { ContentProvider } from "@pna/agent";
import type { AuthClient, JobsClient, SessionStore } from "@pna/auth";
import {
  createOwnedRepository,
  createStateRepository,
  debouncedSaver,
  memoryStore,
  MIGRATIONS,
  type KeyValueStore,
  type SecretStore,
  type StateRepository,
} from "@pna/storage";
import { createSecretStore } from "@pna/storage";
import { createRemoteJobs } from "./adapters/remote-jobs.js";
import type { JobsGateway } from "./ports/jobs.js";
import { createStore, type Store } from "./store.js";
import { createTaskTracker, type TaskTracker } from "./tasks.js";
import { createAccountService, type AccountService } from "./usecases/account.js";

export interface AppDeps {
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly provider: ContentProvider;
  readonly repository: StateRepository;
  readonly secrets: SecretStore;
  readonly tasks: TaskTracker;
  /**
   * Present only when the app was given somewhere to sign in to. A build with
   * no API configured is a working offline app, not a broken one.
   */
  readonly account: AccountService | null;
  /**
   * Where generation runs when there is an account to run it for. Absent means
   * every call is made from this device and dies with it — correct for a build
   * with no server, and the fallback when nobody is signed in.
   */
  readonly jobs: JobsGateway | null;
}

export interface AppContext {
  readonly store: Store;
  readonly deps: AppDeps;
}

export interface AuthWiring {
  readonly client: AuthClient;
  readonly sessions: SessionStore;
  /**
   * The jobs half of the same API. Without it the app still signs in and syncs;
   * it just runs generation on the device, as it did before there was a server.
   */
  readonly jobs?: JobsClient;
}

export interface BootstrapOptions {
  readonly provider: ContentProvider;
  /**
   * The device's key-value store. Given one, the app keeps a separate document
   * per owner and can move between them when the user signs in or out.
   */
  readonly kv?: KeyValueStore;
  readonly auth?: AuthWiring;
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
  const owned = options.kv ? createOwnedRepository(options.kv, { migrations: MIGRATIONS }) : null;
  const repository = options.repository ?? owned ?? createStateRepository(memoryStore());
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

  const account =
    owned && options.auth
      ? createAccountService({
          client: options.auth.client,
          sessions: options.auth.sessions,
          repository: owned,
          store,
        })
      : null;

  // A session saved on a previous run means the app opens on the account's
  // data, not on the local document it happened to load a moment ago.
  if (account) await account.restore();

  const jobs =
    account && options.auth?.jobs ? createRemoteJobs(options.auth.jobs, account) : null;

  const context: AppContext = {
    store,
    deps: {
      clock: options.clock ?? systemClock,
      ids: options.ids ?? randomIds(),
      provider: options.provider,
      repository,
      secrets,
      tasks: options.tasks ?? createTaskTracker(),
      account,
      jobs,
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
