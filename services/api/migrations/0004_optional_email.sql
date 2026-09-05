-- Почта перестаёт быть обязательной.
--
-- Аккаунт — это ключ доступа, а не адрес: устройство заводит ключ и сразу
-- работает. Адрес остаётся полезным, но как пометка, которую можно добавить
-- потом: по нему удобно найти аккаунт на другом устройстве.
--
-- SQLite не умеет снимать NOT NULL на месте, поэтому таблица пересобирается.
-- UNIQUE на email_lower сохраняется и продолжает запрещать два аккаунта на один
-- адрес: несколько NULL друг другу не мешают, а два одинаковых адреса — да.

CREATE TABLE accounts_next (
  id             TEXT PRIMARY KEY,
  email          TEXT,
  email_lower    TEXT UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name   TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

INSERT INTO accounts_next (id, email, email_lower, email_verified, display_name, created_at)
SELECT id, email, email_lower, email_verified, display_name, created_at FROM accounts;

DROP TABLE accounts;

ALTER TABLE accounts_next RENAME TO accounts;
