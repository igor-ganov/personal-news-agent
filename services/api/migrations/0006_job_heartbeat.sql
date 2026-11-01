-- A running job says it is alive.
--
-- Liveness used to be guessed from started_at: a run was presumed dead a
-- quarter of an hour after it began. A generation can legitimately run longer
-- than that, and a run killed in its first minute was left looking alive for
-- the rest of the window. The runner now stamps heartbeat_at every half minute
-- while it waits on the model, and a job is dead when that stamp goes stale.

ALTER TABLE jobs ADD COLUMN heartbeat_at TEXT;
