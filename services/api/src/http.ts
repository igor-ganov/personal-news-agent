import type { Context } from "hono";

/**
 * One error shape for the whole API: a stable machine-readable `code` plus a
 * sentence the app can show. Clients branch on the code, never on the text.
 */
export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export const fail = (c: Context, status: number, code: string, message: string): Response =>
  c.json<ApiError>({ code, message }, status as 400);

export const badRequest = (c: Context, message: string): Response =>
  fail(c, 400, "bad_request", message);

export const unauthorized = (c: Context): Response =>
  fail(c, 401, "unauthorized", "Нужно войти заново");

export const tooManyRequests = (c: Context): Response =>
  fail(c, 429, "rate_limited", "Слишком много попыток, попробуйте позже");

/** Reads a JSON body without letting a malformed one throw out of the handler. */
export const readJson = async <T>(c: Context): Promise<T | null> => {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
};

export const clientIp = (c: Context): string =>
  c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
