import { Hono } from "hono";
import { accountForToken, readDocument, writeDocument } from "../db.js";
import type { Env } from "../env.js";
import { badRequest, fail, readJson, unauthorized } from "../http.js";

/** Guards against one account filling the database with a runaway document. */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const bearer = (header: string | undefined): string | null =>
  header?.startsWith("Bearer ") ? header.slice(7) : null;

export const stateRoutes = new Hono<{ Bindings: Env }>();

/**
 * The account's state document.
 *
 * Sync is whole-document with an optimistic revision rather than per-record
 * merging. That is an honest fit for one person on a handful of devices: it
 * cannot silently lose a write — a stale revision is refused and the client is
 * handed the current document to merge — and it keeps the server free of any
 * knowledge of what a topic or a digest is.
 */
stateRoutes.get("/", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) return unauthorized(c);
  const account = await accountForToken(c.env, token);
  if (!account) return unauthorized(c);

  const document = await readDocument(c.env, account.id);
  return c.json({
    revision: document?.revision ?? 0,
    updatedAt: document?.updated_at ?? null,
    body: document ? (JSON.parse(document.body) as unknown) : null,
  });
});

stateRoutes.put("/", async (c) => {
  const token = bearer(c.req.header("Authorization"));
  if (!token) return unauthorized(c);
  const account = await accountForToken(c.env, token);
  if (!account) return unauthorized(c);

  const payload = await readJson<{ revision?: number; body?: unknown }>(c);
  if (!payload || typeof payload.revision !== "number" || payload.body === undefined)
    return badRequest(c, "Нужны revision и body");

  const body = JSON.stringify(payload.body);
  if (body.length > MAX_DOCUMENT_BYTES)
    return fail(c, 413, "document_too_large", "Документ слишком большой");

  const written = await writeDocument(c.env, account.id, body, payload.revision);
  if (!written) {
    const current = await readDocument(c.env, account.id);
    return c.json(
      {
        code: "revision_conflict",
        message: "Данные изменились на другом устройстве",
        revision: current?.revision ?? 0,
        body: current ? (JSON.parse(current.body) as unknown) : null,
      },
      409,
    );
  }

  return c.json({ revision: written.revision, updatedAt: written.updated_at });
});
