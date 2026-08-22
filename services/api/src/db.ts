import { randomId, randomToken, sha256Hex } from "./crypto.js";
import type { Env } from "./env.js";

export interface AccountRow {
  id: string;
  email: string;
  email_lower: string;
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

export const createAccount = async (env: Env, email: string): Promise<AccountRow> => {
  const row: AccountRow = {
    id: randomId(),
    email,
    email_lower: email.toLowerCase(),
    email_verified: 0,
    display_name: email.split("@")[0] ?? "",
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
  ]);
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
