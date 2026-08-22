import { err, ok, type AppState, type Result } from "@pna/core";
import { decodeState, encodeState, type Migration } from "./codec.js";
import { asStorageError } from "./adapters/web-storage.js";
import { storageError, type KeyValueStore, type StorageError } from "./ports/kv.js";

export const STATE_KEY = "pna.state.v1";

export interface StateRepository {
  /** Returns `null` when nothing has been saved yet — a first run, not an error. */
  load(): Promise<Result<AppState | null, StorageError>>;
  save(state: AppState): Promise<Result<void, StorageError>>;
  clear(): Promise<Result<void, StorageError>>;
}

export interface RepositoryOptions {
  readonly key?: string;
  readonly migrations?: Readonly<Record<number, Migration>>;
}

export const createStateRepository = (
  store: KeyValueStore,
  options: RepositoryOptions = {},
): StateRepository => {
  const key = options.key ?? STATE_KEY;

  return {
    async load() {
      let raw: string | null;
      try {
        raw = await store.get(key);
      } catch (error) {
        return err(asStorageError(error));
      }
      if (raw === null) return ok(null);
      return decodeState(raw, options.migrations);
    },

    async save(state) {
      try {
        await store.set(key, encodeState(state));
        return ok(undefined);
      } catch (error) {
        return err(asStorageError(error));
      }
    },

    async clear() {
      try {
        await store.remove(key);
        return ok(undefined);
      } catch (error) {
        return err(asStorageError(error));
      }
    },
  };
};

export interface SaverOptions {
  /**
   * Called when a debounced write fails. Without it a full disk or an exhausted
   * quota is silent: the app keeps running on state that is no longer being
   * saved, and the user only finds out after a restart.
   */
  readonly onError?: (error: StorageError) => void;
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly cancel?: (handle: unknown) => void;
}

export interface Saver {
  save(state: AppState): void;
  flush(): Promise<Result<void, StorageError>>;
}

/**
 * Coalesces bursts of saves into one write.
 *
 * Every keystroke in a topic editor dispatches an action; without this the app
 * would serialise the whole state on each one.
 */
export const debouncedSaver = (
  repository: StateRepository,
  delayMs: number,
  options: SaverOptions = {},
): Saver => {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? ((handle: unknown) => clearTimeout(handle as never));

  let handle: unknown = null;
  let pending: AppState | null = null;

  const write = async (): Promise<Result<void, StorageError>> => {
    const state = pending;
    pending = null;
    if (handle !== null) {
      cancel(handle);
      handle = null;
    }
    if (!state) return ok(undefined);

    const result = await repository.save(state);
    if (!result.ok) options.onError?.(result.error);
    return result;
  };

  return {
    save(state) {
      pending = state;
      if (handle !== null) cancel(handle);
      handle = schedule(() => {
        void write();
      }, delayMs);
    },
    flush: write,
  };
};

export const missingStore = (): StorageError =>
  storageError("unavailable", "Хранилище недоступно");
