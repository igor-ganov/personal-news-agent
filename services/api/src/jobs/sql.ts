/**
 * The slice of D1 the job store uses.
 *
 * `D1Database` satisfies it structurally, and so does an in-memory SQLite in
 * the tests — which is what lets the queue's SQL be exercised without a Worker.
 * The `null` in `first` is D1's contract, not a choice made here.
 */
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  run(): Promise<{ readonly meta: { readonly changes?: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ readonly results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
}

/** What the job store needs from the environment: a database, nothing else. */
export interface JobStore {
  readonly DB: SqlDatabase;
}
