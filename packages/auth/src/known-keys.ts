import type { KeyValueStore } from "@pna/storage";

export const KNOWN_KEYS_KEY = "pna.passkeys.v1";

/**
 * The passkeys this device is known to sign in with.
 *
 * A phone can hold keys for accounts the server no longer has, and the system
 * prompt offers every key it holds for the site. Picking one of those starts a
 * second, empty account. Asking only for the keys the account lists keeps the
 * leftovers out of the prompt. The list outlives sign-out on purpose: signing
 * back in is exactly when it matters.
 */
export interface KnownKeysStore {
  load(): Promise<readonly string[]>;
  save(credentialIds: readonly string[]): Promise<void>;
}

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** Anything that is not a list of ids reads as "nothing known". */
const parse = (raw: string | null): readonly string[] => {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(isId) : [];
  } catch {
    return [];
  }
};

export const createKnownKeysStore = (
  store: KeyValueStore,
  key: string = KNOWN_KEYS_KEY,
): KnownKeysStore => ({
  load: async () => parse(await store.get(key)),
  save: (credentialIds) =>
    credentialIds.length > 0 ? store.set(key, JSON.stringify(credentialIds)) : store.remove(key),
});
