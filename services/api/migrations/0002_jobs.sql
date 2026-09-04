-- Generation moved off the device.
--
-- A model call for a lecture or a program plan runs for minutes. Started from a
-- phone it dies with the app, and nothing on a second device ever knows it
-- happened. Here it is a row: any device of the account can see that the work
-- is running, and the answer — or the failure — waits for whoever comes back.

CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- The key the app tracks this work under ('program:topic_1', 'lesson:l4').
  -- It is what lets a screen recognise its own request after a restart.
  task_key     TEXT NOT NULL,
  kind         TEXT NOT NULL,           -- sources | digest | program | lesson | quiz
  input        TEXT NOT NULL,           -- JSON payload for the provider call
  meta         TEXT NOT NULL DEFAULT '{}', -- opaque to the server; the app's own bookkeeping
  status       TEXT NOT NULL,           -- queued | running | done | failed
  result       TEXT,                    -- JSON, once done
  error_kind   TEXT,
  error_message TEXT,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  started_at   TEXT,
  finished_at  TEXT
);

CREATE INDEX jobs_by_account ON jobs(account_id, updated_at);
CREATE INDEX jobs_by_status ON jobs(status, updated_at);

-- One live job per key per account: tapping "обновить" twice cannot cost two
-- generations, and the rule holds across devices because it lives here.
CREATE UNIQUE INDEX jobs_live_key ON jobs(account_id, task_key)
  WHERE status IN ('queued', 'running');

-- The API key the server uses on the account's behalf, encrypted at rest with
-- a key only the Worker holds. Stored per account rather than per device so
-- signing in on a second phone does not mean pasting the key again.
CREATE TABLE provider_keys (
  account_id   TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  ciphertext   TEXT NOT NULL,
  iv           TEXT NOT NULL,
  model        TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL
);
