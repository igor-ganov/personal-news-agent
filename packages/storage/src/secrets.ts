import type { KeyValueStore } from "./ports/kv.js";

export const API_KEY_KEY = "pna.secret.apiKey";

/**
 * Where the provider credential lives.
 *
 * It is deliberately a separate port from the state repository: the key must
 * never end up inside an exported or backed-up state document, and on Android
 * the app backs this with encrypted storage while the rest of the state stays
 * in a plain file.
 */
export interface SecretStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
}

export const createSecretStore = (
  store: KeyValueStore,
  key: string = API_KEY_KEY,
): SecretStore => ({
  async get() {
    const raw = await store.get(key);
    const trimmed = raw?.trim() ?? "";
    return trimmed.length === 0 ? null : trimmed;
  },
  async set(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      await store.remove(key);
      return;
    }
    await store.set(key, trimmed);
  },
  async clear() {
    await store.remove(key);
  },
});

/** Masked form for display — never render the key itself back to the screen. */
export const maskSecret = (value: string | null): string => {
  if (!value) return "не задан";
  const tail = value.slice(-4);
  return `••••••••${tail}`;
};
