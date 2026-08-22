/**
 * The whole passkey flow against a running API — `wrangler dev` locally, or a
 * deployed Worker — driven through the same client the app uses, with a
 * software authenticator standing in for the phone's keystore. Skipped unless
 * PNA_API_URL is set, so the default test run stays offline:
 *
 *   PNA_API_URL=http://127.0.0.1:8787 pnpm vitest run --project api
 */

import { createAuthClient, createTransport } from "@pna/auth";
import { virtualPasskeyAgent } from "@pna/auth/testing";
import { beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.PNA_API_URL?.replace(/\/$/, "");

const raw = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const { token, ...rest } = init;
  const response = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...rest.headers },
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};

describe.skipIf(!BASE)("живой API", () => {
  const email = `probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const transport = createTransport({ baseUrl: BASE ?? "" });
  let client: ReturnType<typeof createAuthClient>;
  let passkeys: ReturnType<typeof virtualPasskeyAgent>;
  let rpId = "";
  let token = "";

  beforeAll(async () => {
    const health = await raw("/health");
    expect(health.status).toBe(200);
    rpId = health.json.rpId;
    passkeys = virtualPasskeyAgent({
      rpId,
      origin: process.env.PNA_API_ORIGIN ?? `https://${rpId}`,
    });
    client = createAuthClient({ transport, passkeys });
  });

  it("сообщает, каким доменом подписаны ключи", () => {
    expect(rpId).toBeTruthy();
  });

  it("регистрирует аккаунт по ключу", async () => {
    const session = await client.register({ email, label: "Виртуальный ключ" });

    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.account.email).toBe(email);
    expect(session.value.account.emailVerified).toBe(false);
    expect(session.value.expiresAt > new Date().toISOString()).toBe(true);
    token = session.value.token;
  });

  it("не даёт занять тот же адрес дважды", async () => {
    const again = await client.register({ email });
    expect(again.ok === false && again.error.kind).toBe("email_taken");
  });

  it("отклоняет непохожий на почту адрес на самом сервере", async () => {
    const response = await fetch(`${BASE}/auth/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "не почта" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("bad_request");
  });

  it("показывает аккаунт и его ключи по сессии", async () => {
    const me = await client.me(token);
    expect(me.ok).toBe(true);
    if (!me.ok) return;
    expect(me.value.account.email).toBe(email);
    expect(me.value.passkeys).toHaveLength(1);
    expect(me.value.passkeys[0]?.label).toBe("Виртуальный ключ");
  });

  it("не отдаёт единственный ключ на удаление", async () => {
    const me = await client.me(token);
    if (!me.ok) throw new Error("нет сессии");

    const removed = await client.removePasskey(token, me.value.passkeys[0]!.credentialId);

    expect(removed.ok === false && removed.error.kind).toBe("conflict");
  });

  it("пускает по ключу без пароля", async () => {
    const session = await client.login({ email });

    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.account.email).toBe(email);
    token = session.value.token;
  });

  it("не принимает тот же challenge второй раз", async () => {
    const started = await transport.request<{ challengeId: string; options: { challenge: string } }>(
      "/auth/login/options",
      { method: "POST", body: { email } },
    );
    if (!started.ok) throw new Error(started.error.message);

    const assertion = await passkeys.get(started.value.options);
    const body = { challengeId: started.value.challengeId, response: assertion };

    const first = await transport.request<{ token: string }>("/auth/login/verify", { method: "POST", body });
    expect(first.ok).toBe(true);
    if (first.ok) token = first.value.token;

    // Byte-identical repeat: the signature is still valid, so only the
    // single-use challenge stands between a captured response and a session.
    const replay = await transport.request("/auth/login/verify", { method: "POST", body });
    expect(replay.ok === false && replay.error.kind).toBe("expired");
  });

  it("молчит о том, есть ли аккаунт с этим адресом", async () => {
    const unknown = await transport.request<{ options: { challenge: string } }>("/auth/login/options", {
      method: "POST",
      body: { email: `unknown-${email}` },
    });
    expect(unknown.ok && unknown.value.options.challenge.length > 0).toBe(true);
  });

  it("не пускает к состоянию без сессии", async () => {
    expect((await raw("/state")).status).toBe(401);
    expect((await raw("/state", { token: "definitely-not-a-token" })).status).toBe(401);
  });

  it("хранит документ состояния и нумерует ревизии", async () => {
    const written = await client.push(token, 0, { version: 2, topics: ["первая"] });
    expect(written.ok && written.value.kind).toBe("saved");
    expect(written.ok && written.value.kind === "saved" && written.value.revision).toBe(1);

    const read = await client.pull(token);
    expect(read.ok && read.value.revision).toBe(1);
    expect(read.ok && (read.value.body as { topics: string[] }).topics).toEqual(["первая"]);
  });

  it("запись поверх более новой ревизии возвращает актуальный документ", async () => {
    const stale = await client.push(token, 0, { version: 2, topics: [] });

    expect(stale.ok && stale.value.kind).toBe("conflict");
    expect(stale.ok && stale.value.kind === "conflict" && stale.value.remote.revision).toBe(1);
    expect(
      stale.ok && stale.value.kind === "conflict" && (stale.value.remote.body as { topics: string[] }).topics,
    ).toEqual(["первая"]);
  });

  it("гасит сессию при выходе", async () => {
    expect((await client.logout(token)).ok).toBe(true);
    expect((await client.pull(token)).ok === false).toBe(true);
    expect((await client.me(token)).ok === false).toBe(true);
  });

  it("лишний слэш — это опечатка, а не другой ресурс", async () => {
    const response = await fetch(`${BASE}/state/`, { redirect: "manual" });
    expect([301, 308]).toContain(response.status);
  });

  it("отдаёт assetlinks для Android", async () => {
    const links = await raw("/.well-known/assetlinks.json");
    expect(links.status).toBe(200);
    expect(Array.isArray(links.json)).toBe(true);
  });
});
