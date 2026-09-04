import type { Context } from "hono";
import { accountForToken, type AccountRow } from "./db.js";
import type { Env } from "./env.js";

/** The bearer token of a request, or null when there is none to read. */
export const bearerToken = (header: string | undefined): string | null =>
  header?.startsWith("Bearer ") ? header.slice(7) : null;

/**
 * The account behind a request, or null.
 *
 * Every authenticated route starts here, so "who is asking" is answered in one
 * place rather than re-derived per handler.
 */
export const requestAccount = async (
  c: Context<{ Bindings: Env }>,
): Promise<AccountRow | null> => {
  const token = bearerToken(c.req.header("Authorization"));
  return token ? accountForToken(c.env, token) : null;
};
