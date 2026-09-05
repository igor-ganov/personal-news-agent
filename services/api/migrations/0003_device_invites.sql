-- Adding a second device without typing anything.
--
-- A signed-in device mints a one-time link; the new device opens it and creates
-- a passkey for the same account. The link is the whole credential for that one
-- action, so it is short-lived, single-use, and stored the way a session token
-- is: only its hash. A dump of this table cannot enroll anybody.

CREATE TABLE device_invites (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- Set only when a passkey was actually created, so an opened-but-abandoned
  -- link stays usable until it expires.
  used_at    TEXT
);

CREATE INDEX device_invites_by_account ON device_invites(account_id);
CREATE INDEX device_invites_by_expiry ON device_invites(expires_at);
