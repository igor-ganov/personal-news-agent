-- Accounts, their authenticators, and the state document each account owns.
--
-- Two habits run through this schema:
--   * nothing that can authenticate is stored in a directly usable form —
--     session tokens are kept as hashes, the same way a password would be;
--   * everything short-lived carries an explicit expiry, so a stale challenge
--     or session is a row that can be deleted rather than a judgement call.

CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  email_lower   TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

-- One row per registered authenticator. `id` is the base64url credential id.
CREATE TABLE credentials (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,          -- base64url COSE key
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT NOT NULL DEFAULT '',
  label        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX credentials_by_account ON credentials(account_id);

-- A WebAuthn challenge is single-use: it is deleted the moment it is consumed,
-- so a replayed response finds nothing to verify against.
CREATE TABLE challenges (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,            -- 'register' | 'login'
  email_lower TEXT,                    -- null for a usernameless login
  account_id TEXT,
  challenge  TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX challenges_by_expiry ON challenges(expires_at);

-- Only the hash of a session token is stored. A dump of this table therefore
-- does not let anyone sign in as anybody.
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX sessions_by_account ON sessions(account_id);
CREATE INDEX sessions_by_expiry ON sessions(expires_at);

-- The account's state document. `revision` is what makes a concurrent write
-- from a second device fail loudly instead of overwriting silently.
CREATE TABLE documents (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Coarse throttling: one row per (bucket, subject) window.
CREATE TABLE rate_limits (
  bucket     TEXT NOT NULL,
  subject    TEXT NOT NULL,
  window_at  TEXT NOT NULL,
  hits       INTEGER NOT NULL,
  PRIMARY KEY (bucket, subject, window_at)
);
