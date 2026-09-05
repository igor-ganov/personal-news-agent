import { randomId, randomToken, sha256Hex } from "./crypto.js";
import type { Env } from "./env.js";

export interface AccountRow {
  id: string;
  /** Optional: an account is a passkey, and the address is a label for it. */
  email: string | null;
  email_lower: string | null;
  email_verified: number;
  display_name: string;
  created_at: string;
}

export interface CredentialRow {
  id: string;
  account_id: string;
  public_key: string;
  counter: number;
  transports: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

const nowIso = (): string => new Date().toISOString();
const plusMs = (ms: number): string => new Date(Date.now() + ms).toISOString();

export const CHALLENGE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;

/* --------------------------------------------------------------- accounts -- */

export const findAccountByEmail = (env: Env, emailLower: string): Promise<AccountRow | null> =>
  env.DB.prepare("SELECT * FROM accounts WHERE email_lower = ?").bind(emailLower).first<AccountRow>();

export const findAccountById = (env: Env, id: string): Promise<AccountRow | null> =>
  env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<AccountRow>();

export const createAccount = async (env: Env, email: string | null): Promise<AccountRow> => {
  const row: AccountRow = {
    id: randomId(),
    email,
    email_lower: email ? email.toLowerCase() : null,
    email_verified: 0,
    display_name: email ? (email.split("@")[0] ?? "") : "",
    created_at: nowIso(),
  };
  await env.DB.prepare(
    `INSERT INTO accounts (id, email, email_lower, email_verified, display_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(row.id, row.email, row.email_lower, row.email_verified, row.display_name, row.created_at)
    .run();
  return row;
};

/* ------------------------------------------------------------ credentials -- */

export const credentialsOfAccount = async (env: Env, accountId: string): Promise<CredentialRow[]> => {
  const { results } = await env.DB.prepare("SELECT * FROM credentials WHERE account_id = ?")
    .bind(accountId)
    .all<CredentialRow>();
  return results ?? [];
};

export const findCredential = (env: Env, id: string): Promise<CredentialRow | null> =>
  env.DB.prepare("SELECT * FROM credentials WHERE id = ?").bind(id).first<CredentialRow>();

export const insertCredential = async (
  env: Env,
  row: Omit<CredentialRow, "created_at" | "last_used_at">,
): Promise<void> => {
  await env.DB.prepare(
    `INSERT INTO credentials (id, account_id, public_key, counter, transports, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(row.id, row.account_id, row.public_key, row.counter, row.transports, row.label, nowIso())
    .run();
};

export const touchCredential = async (env: Env, id: string, counter: number): Promise<void> => {
  await env.DB.prepare("UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?")
    .bind(counter, nowIso(), id)
    .run();
};

export const deleteCredential = async (env: Env, accountId: string, id: string): Promise<void> => {
  await env.DB.prepare("DELETE FROM credentials WHERE id = ? AND account_id = ?")
    .bind(id, accountId)
    .run();
};

/* ------------------------------------------------------------- challenges -- */

export interface ChallengeRow {
  id: string;
  kind: string;
  email_lower: string | null;
  account_id: string | null;
  challenge: string;
  expires_at: string;
}

export const putChallenge = async (
  env: Env,
  kind: "register" | "login",
  challenge: string,
  emailLower: string | null,
  accountId: string | null,
): Promise<string> => {
  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO challenges (id, kind, email_lower, account_id, challenge, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, kind, emailLower, accountId, challenge, plusMs(CHALLENGE_TTL_MS))
    .run();
  return id;
};

/**
 * Reads a challenge and deletes it in the same breath. A challenge that has
 * been used once is gone, so a replayed WebAuthn response has nothing to match.
 */
export const takeChallenge = async (env: Env, id: string): Promise<ChallengeRow | null> => {
  const row = await env.DB.prepare("SELECT * FROM challenges WHERE id = ?")
    .bind(id)
    .first<ChallengeRow>();
  if (!row) return null;
  await env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(id).run();
  return row.expires_at > nowIso() ? row : null;
};

export const pruneExpired = async (env: Env): Promise<void> => {
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM challenges WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM device_invites WHERE expires_at <= ?").bind(now),
  ]);
};

/* --------------------------------------------------------- device invites -- */

/** Short on purpose: a link that adds a device is a credential in transit. */
export const INVITE_TTL_MS = 10 * 60_000;

export interface InviteIssue {
  readonly token: string;
  readonly expiresAt: string;
}

/**
 * Mints a one-time enrollment link for an account.
 *
 * Only the hash is stored, exactly as for a session token: the value exists in
 * the QR code and in the URL the user copies, and nowhere else.
 */
export const createInvite = async (env: Env, accountId: string): Promise<InviteIssue> => {
  const token = randomToken();
  const expiresAt = plusMs(INVITE_TTL_MS);
  await env.DB.prepare(
    `INSERT INTO device_invites (token_hash, account_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(await sha256Hex(token), accountId, nowIso(), expiresAt)
    .run();
  return { token, expiresAt };
};

/** The account a live invite belongs to, without spending it. */
export const accountForInvite = async (env: Env, token: string): Promise<AccountRow | null> => {
  const row = await env.DB.prepare(
    `SELECT a.* FROM device_invites i JOIN accounts a ON a.id = i.account_id
     WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`,
  )
    .bind(await sha256Hex(token), nowIso())
    .first<AccountRow>();
  return row;
};

/**
 * Spends the invite. The UPDATE is the check, so two devices racing on one link
 * cannot both enroll — exactly one sees a row come back.
 */
export const consumeInvite = async (env: Env, token: string): Promise<string | null> => {
  const now = nowIso();
  const row = await env.DB.prepare(
    `UPDATE device_invites SET used_at = ?1
     WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1
     RETURNING account_id`,
  )
    .bind(now, await sha256Hex(token))
    .first<{ account_id: string }>();
  return row?.account_id ?? null;
};

/* --------------------------------------------------------------- sessions -- */

export interface SessionIssue {
  readonly token: string;
  readonly expiresAt: string;
}

export const createSession = async (env: Env, accountId: string): Promise<SessionIssue> => {
  const token = randomToken();
  const expiresAt = plusMs(SESSION_TTL_MS);
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, account_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(await sha256Hex(token), accountId, nowIso(), expiresAt, nowIso())
    .run();
  return { token, expiresAt };
};

export const accountForToken = async (env: Env, token: string): Promise<AccountRow | null> => {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(hash, nowIso())
    .first<AccountRow>();
  if (row) {
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(nowIso(), hash)
      .run();
  }
  return row;
};

/**
 * Attaches an address to an account that did not have one — the opt-in half.
 * Returns false when someone else already holds it.
 */
export const setAccountEmail = async (
  env: Env,
  accountId: string,
  email: string,
): Promise<boolean> => {
  const lower = email.toLowerCase();
  const taken = await findAccountByEmail(env, lower);
  if (taken && taken.id !== accountId) return false;

  await env.DB.prepare(
    `UPDATE accounts SET email = ?, email_lower = ?, email_verified = 0,
       display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END
     WHERE id = ?`,
  )
    .bind(email, lower, email.split("@")[0] ?? "", accountId)
    .run();
  return true;
};

export const revokeSession = async (env: Env, token: string): Promise<void> => {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
};

/* -------------------------------------------------------------- documents -- */

export interface DocumentRow {
  account_id: string;
  revision: number;
  body: string;
  updated_at: string;
}

export const readDocument = (env: Env, accountId: string): Promise<DocumentRow | null> =>
  env.DB.prepare("SELECT * FROM documents WHERE account_id = ?").bind(accountId).first<DocumentRow>();

/**
 * Writes the document only when the caller's `expectedRevision` still matches.
 * A second device that edited in the meantime gets `null` back and can merge,
 * rather than having its work overwritten without anyone noticing.
 */
export const writeDocument = async (
  env: Env,
  accountId: string,
  body: string,
  expectedRevision: number,
): Promise<DocumentRow | null> => {
  const current = await readDocument(env, accountId);
  const revision = (current?.revision ?? 0) + 1;
  if ((current?.revision ?? 0) !== expectedRevision) return null;

  const row: DocumentRow = { account_id: accountId, revision, body, updated_at: nowIso() };
  await env.DB.prepare(
    `INSERT INTO documents (account_id, revision, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET revision = excluded.revision,
       body = excluded.body, updated_at = excluded.updated_at`,
  )
    .bind(row.account_id, row.revision, row.body, row.updated_at)
    .run();
  return row;
};

/* ------------------------------------------------------------ rate limits -- */

/** Coarse fixed-window throttle; enough to blunt scripted attempts. */
export const hitRateLimit = async (
  env: Env,
  bucket: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<boolean> => {
  const windowAt = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, subject, window_at, hits) VALUES (?, ?, ?, 1)
     ON CONFLICT(bucket, subject, window_at) DO UPDATE SET hits = hits + 1`,
  )
    .bind(bucket, subject, windowAt)
    .run();

  const row = await env.DB.prepare(
    "SELECT hits FROM rate_limits WHERE bucket = ? AND subject = ? AND window_at = ?",
  )
    .bind(bucket, subject, windowAt)
    .first<{ hits: number }>();
  return (row?.hits ?? 0) <= limit;
};
