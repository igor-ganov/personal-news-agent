-- What a running job is doing right now: the stage, the last search, the piece
-- of the answer being written. The runner rewrites it every couple of seconds
-- while the model streams, and the app shows it instead of a bare spinner.
-- A new attempt starts with it cleared.

ALTER TABLE jobs ADD COLUMN progress TEXT;
