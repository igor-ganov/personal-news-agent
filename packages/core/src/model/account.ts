import type { Instant } from "../time/instant.js";
import type { AccountId } from "./ids.js";

/**
 * An account, as the client knows it.
 *
 * Deliberately thin: the client never holds anything secret about the account.
 * A passkey's private key lives in the platform authenticator and its public
 * key on the server, so the only credential material here is metadata used to
 * tell one authenticator from another in the UI.
 */
export interface Account {
  readonly id: AccountId;
  readonly email: string;
  /**
   * Whether the address was proven. Registration works without it — the passkey
   * is what authenticates — so an unverified address is a label for recovery,
   * not a permission.
   */
  readonly emailVerified: boolean;
  readonly displayName: string;
  readonly createdAt: Instant;
}

/** A registered authenticator, shown so the user can recognise and revoke it. */
export interface PasskeyRef {
  /** base64url credential id — the handle the server knows it by. */
  readonly credentialId: string;
  readonly label: string;
  readonly createdAt: Instant;
  readonly lastUsedAt: Instant | null;
}

/**
 * Who the data on this device belongs to.
 *
 * `local` is the state of an app that has never signed in — real data the user
 * created, not a placeholder. That is exactly why signing in has to decide what
 * happens to it rather than quietly dropping it.
 */
export type Owner =
  | { readonly kind: "local" }
  | { readonly kind: "account"; readonly accountId: AccountId };

export const LOCAL_OWNER: Owner = { kind: "local" };

export const accountOwner = (accountId: AccountId): Owner => ({ kind: "account", accountId });

export const ownerId = (owner: Owner): string =>
  owner.kind === "local" ? "local" : owner.accountId;

export const sameOwner = (a: Owner, b: Owner): boolean => ownerId(a) === ownerId(b);

/** Normalised form used for comparison and for sending to the server. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Deliberately permissive: this is a client-side sanity check to catch typos,
 * not an authority on what an address may look like. The server decides.
 */
export const isPlausibleEmail = (email: string): boolean => {
  const value = normaliseEmail(email);
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value) && value.length <= 254;
};
