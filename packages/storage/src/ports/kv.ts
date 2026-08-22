/**
 * The only thing persistence needs from its host: read, write, delete a string.
 *
 * Keeping the port this narrow is what lets the same repository run on
 * localStorage in the browser, on the filesystem under Tauri, and in memory
 * in tests, with no conditional code above it.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type StorageErrorKind = "unavailable" | "quota" | "corrupt" | "unknown";

export interface StorageError {
  readonly kind: StorageErrorKind;
  readonly message: string;
}

export const storageError = (kind: StorageErrorKind, message: string): StorageError => ({
  kind,
  message,
});
