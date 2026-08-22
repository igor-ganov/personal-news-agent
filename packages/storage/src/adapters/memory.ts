import type { KeyValueStore } from "../ports/kv.js";

/** In-memory store — the default in tests, and a safe fallback when nothing else works. */
export const memoryStore = (initial: Readonly<Record<string, string>> = {}): KeyValueStore => {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
  };
};
