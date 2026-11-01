/**
 * A database port over an in-memory SQLite with the real migrations applied —
 * the SQL under test is the SQL that ships, not a hand-written imitation.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SqlDatabase, SqlStatement } from "../../src/jobs/sql.js";

const MIGRATIONS = join(import.meta.dirname, "..", "..", "migrations");

const applyMigrations = (db: DatabaseSync): void =>
  readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .forEach((file) => db.exec(readFileSync(join(MIGRATIONS, file), "utf8")));

const toInput = (value: unknown): SQLInputValue => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return Number(value);
  throw new TypeError(`unsupported SQL value: ${String(value)}`);
};

/*
 * The port is generic over the row shape, and SQLite hands back untyped
 * records. The tests seed the rows they read, so the one cast is confined here.
 */
const rowAs = <T>(row: Record<string, unknown>): T => ({ ...row }) as T;

const statementOf = (
  db: DatabaseSync,
  sql: string,
  values: readonly SQLInputValue[],
): SqlStatement => ({
  bind: (...next) => statementOf(db, sql, next.map(toInput)),
  run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...values).changes) } }),
  all: async <T>() => ({ results: db.prepare(sql).all(...values).map((row) => rowAs<T>(row)) }),
  first: async <T>() => {
    const row = db.prepare(sql).get(...values);
    return row === undefined ? null : rowAs<T>(row);
  },
});

export interface TestDatabase {
  readonly DB: SqlDatabase;
  readonly sqlite: DatabaseSync;
}

/** The account every seeded job belongs to; jobs reference accounts by key. */
export const TEST_ACCOUNT = "acc";

export const createTestDatabase = (): TestDatabase => {
  const sqlite = new DatabaseSync(":memory:");
  applyMigrations(sqlite);
  sqlite
    .prepare("INSERT INTO accounts (id, created_at) VALUES (?, ?)")
    .run(TEST_ACCOUNT, "2026-01-01T00:00:00.000Z");
  return { DB: { prepare: (sql) => statementOf(sqlite, sql, []) }, sqlite };
};
