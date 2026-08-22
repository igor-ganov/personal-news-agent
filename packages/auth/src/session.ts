import { accountId, instantOf, isAfter, systemClock, type Clock } from "@pna/core";
import type { KeyValueStore } from "@pna/storage";
import type { AuthSession } from "./client.js";

export const SESSION_KEY = "pna.session.v1";

/**
 * Where the session token lives between launches.
 *
 * It is kept apart from the state document for the same reason the API key is:
 * a token is a credential, and credentials must not travel inside data that
 * gets exported, synced or merged.
 */
export interface SessionStore {
  load(): Promise<AuthSession | null>;
  save(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

interface StoredShape {
  token?: unknown;
  expiresAt?: unknown;
  account?: {
    id?: unknown;
    email?: unknown;
    emailVerified?: unknown;
    displayName?: unknown;
    createdAt?: unknown;
  };
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Anything that is not a complete, well-formed session reads as "signed out". */
const parse = (raw: string): AuthSession | null => {
  let data: StoredShape;
  try {
    data = JSON.parse(raw) as StoredShape;
  } catch {
    return null;
  }

  const token = str(data.token);
  const expiresAt = str(data.expiresAt);
  const id = str(data.account?.id);
  const email = str(data.account?.email);
  const createdAt = str(data.account?.createdAt);
  if (!token || !expiresAt || !id || !email || !createdAt) return null;

  return {
    token,
    expiresAt: instantOf(expiresAt),
    account: {
      id: accountId(id),
      email,
      emailVerified: data.account?.emailVerified === true,
      displayName: str(data.account?.displayName) ?? email,
      createdAt: instantOf(createdAt),
    },
  };
};

export const createSessionStore = (
  store: KeyValueStore,
  clock: Clock = systemClock,
  key: string = SESSION_KEY,
): SessionStore => ({
  async load() {
    const raw = await store.get(key);
    if (!raw) return null;

    const session = parse(raw);
    if (!session) {
      await store.remove(key);
      return null;
    }

    // An expired token would only earn a 401 on first use; dropping it here
    // means the app opens as signed out instead of appearing signed in.
    if (!isAfter(session.expiresAt, clock.now())) {
      await store.remove(key);
      return null;
    }

    return session;
  },

  async save(session) {
    await store.set(key, JSON.stringify(session));
  },

  async clear() {
    await store.remove(key);
  },
});
