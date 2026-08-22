import { storageError, type KeyValueStore, type StorageError } from "../ports/kv.js";
import { memoryStore } from "./memory.js";

/** The slice of `Storage` used here — enough to fake in tests. */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");

export const asStorageError = (error: unknown): StorageError =>
  isQuotaError(error)
    ? storageError("quota", "Не хватает места в хранилище")
    : storageError("unknown", error instanceof Error ? error.message : String(error));

/**
 * A `Storage`-backed adapter. Writes surface quota failures as rejections so the
 * repository can report them instead of silently losing data.
 */
export const webStorageStore = (storage: WebStorageLike): KeyValueStore => ({
  async get(key) {
    return storage.getItem(key);
  },
  async set(key, value) {
    try {
      storage.setItem(key, value);
    } catch (error) {
      throw asStorageError(error);
    }
  },
  async remove(key) {
    storage.removeItem(key);
  },
});

/**
 * `localStorage` where it exists, memory otherwise — private-mode browsers and
 * headless renders throw on the very first access, so it is probed once here.
 */
export const browserStore = (): KeyValueStore => {
  try {
    const probe = "__pna_probe__";
    globalThis.localStorage.setItem(probe, "1");
    globalThis.localStorage.removeItem(probe);
    return webStorageStore(globalThis.localStorage);
  } catch {
    return memoryStore();
  }
};
