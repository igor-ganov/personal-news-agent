import { Hono } from "hono";
import type { Env } from "../env.js";
import { badRequest, fail, readJson, unauthorized } from "../http.js";
import { deleteProviderKey, readProviderKeyRow, saveProviderKey } from "../jobs/db.js";
import { requestAccount } from "../session.js";

const MAX_KEY_LENGTH = 400;

export const providerRoutes = new Hono<{ Bindings: Env }>();

/**
 * Whether the server can generate for this account, and with which model.
 *
 * The key itself is never returned — not even to the device that uploaded it.
 * There is no flow that needs to read it back, and one that did would turn the
 * account into a way to exfiltrate it.
 */
providerRoutes.get("/", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  const row = await readProviderKeyRow(c.env, account.id);
  return c.json({
    configured: Boolean(row) || Boolean(c.env.ANTHROPIC_API_KEY),
    ownKey: Boolean(row),
    model: row?.model || c.env.DEFAULT_MODEL || "",
    updatedAt: row?.updated_at ?? null,
  });
});

/**
 * Hands the server the key it should generate with.
 *
 * This is what moves the work off the phone: the app keeps its own copy for
 * offline use, and the account gets one that outlives any single device.
 */
providerRoutes.put("/", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  const payload = await readJson<{ apiKey?: unknown; model?: unknown }>(c);
  const apiKey = typeof payload?.apiKey === "string" ? payload.apiKey.trim() : "";
  const model = typeof payload?.model === "string" ? payload.model.trim() : "";

  if (apiKey.length === 0 || apiKey.length > MAX_KEY_LENGTH)
    return badRequest(c, "Нужен ключ API");

  if (!c.env.PROVIDER_KEY_SECRET)
    return fail(
      c,
      503,
      "no_key_storage",
      "Сервер не настроен хранить ключи: не задан PROVIDER_KEY_SECRET",
    );

  await saveProviderKey(c.env, account.id, apiKey, model);
  return c.json({ configured: true, ownKey: true, model });
});

providerRoutes.delete("/", async (c) => {
  const account = await requestAccount(c);
  if (!account) return unauthorized(c);

  await deleteProviderKey(c.env, account.id);
  return c.json({ configured: Boolean(c.env.ANTHROPIC_API_KEY), ownKey: false });
});
