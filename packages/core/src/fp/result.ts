/**
 * Result — the single error-carrying primitive used across the domain.
 * Domain functions never throw; they return `Result`.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

export const mapResult = <T, U, E>(
  r: Result<T, E>,
  f: (value: T) => U,
): Result<U, E> => (r.ok ? ok(f(r.value)) : r);

export const flatMapResult = <T, U, E>(
  r: Result<T, E>,
  f: (value: T) => Result<U, E>,
): Result<U, E> => (r.ok ? f(r.value) : r);

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  r.ok ? r.value : fallback;

/** Collects a list of results into a result of a list, failing on the first error. */
export const allResults = <T, E>(rs: readonly Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const r of rs) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
};
