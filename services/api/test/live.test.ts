/**
 * The whole passkey flow against a running API — `wrangler dev` locally, or a
 * deployed Worker. Skipped unless PNA_API_URL is set, so the default test run
 * stays offline:
 *
 *   PNA_API_URL=http://127.0.0.1:8787 pnpm vitest run --project api
 */

import { beforeAll, describe, expect, it } from "vitest";
import { createVirtualAuthenticator } from "./virtual-authenticator.js";

const BASE = process.env.PNA_API_URL?.replace(/\/$/, "");

const call = async (
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; json: any }> => {
  const { token, ...rest } = init;
  const response = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};

const post = (path: string, body: unknown, token?: string) =>
  call(path, { method: "POST", body: JSON.stringify(body), ...(token ? { token } : {}) });

describe.skipIf(!BASE)("живой API", () => {
  const email = `probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  let rpId = "";
  let authenticator: ReturnType<typeof createVirtualAuthenticator>;
  let token = "";

  beforeAll(async () => {
    const health = await call("/health");
    expect(health.status).toBe(200);
    rpId = health.json.rpId;
    authenticator = createVirtualAuthenticator({
      rpId,
      origin: process.env.PNA_API_ORIGIN ?? `https://${rpId}`,
    });
  });

  it("отвечает на /health", () => {
    expect(rpId).toBeTruthy();
  });

  it("регистрирует аккаунт по ключу", async () => {
    const options = await post("/auth/register/options", { email });
    expect(options.status).toBe(200);
    expect(options.json.options.rp.id).toBe(rpId);

    const attestation = await authenticator.create(options.json.options);
    const verified = await post("/auth/register/verify", {
      challengeId: options.json.challengeId,
      label: "Виртуальный ключ",
      response: attestation,
    });

    expect(verified.status).toBe(200);
    expect(verified.json.account.email).toBe(email);
    expect(verified.json.account.emailVerified).toBe(false);
    expect(typeof verified.json.token).toBe("string");
    token = verified.json.token;
  });

  it("не даёт занять тот же адрес дважды", async () => {
    const again = await post("/auth/register/options", { email });
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("email_taken");
  });

  it("отклоняет непохожий на почту адрес", async () => {
    const bad = await post("/auth/register/options", { email: "не почта" });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe("bad_request");
  });

  it("показывает аккаунт и его ключи по сессии", async () => {
    const me = await call("/auth/me", { token });
    expect(me.status).toBe(200);
    expect(me.json.account.email).toBe(email);
    expect(me.json.passkeys).toHaveLength(1);
    expect(me.json.passkeys[0].label).toBe("Виртуальный ключ");
  });

  it("не отдаёт единственный ключ на удаление", async () => {
    const me = await call("/auth/me", { token });
    const removed = await call(`/auth/passkeys/${me.json.passkeys[0].credentialId}`, {
      method: "DELETE",
      token,
    });
    expect(removed.status).toBe(409);
    expect(removed.json.code).toBe("last_passkey");
  });

  it("пускает по ключу без пароля", async () => {
    const options = await post("/auth/login/options", { email });
    expect(options.status).toBe(200);
    expect(options.json.options.allowCredentials).toHaveLength(1);

    const assertion = await authenticator.get(options.json.options);
    const verified = await post("/auth/login/verify", {
      challengeId: options.json.challengeId,
      response: assertion,
    });

    expect(verified.status).toBe(200);
    expect(verified.json.account.email).toBe(email);
    token = verified.json.token;
  });

  it("не принимает тот же challenge второй раз", async () => {
    const options = await post("/auth/login/options", { email });
    const assertion = await authenticator.get(options.json.options);
    const first = await post("/auth/login/verify", {
      challengeId: options.json.challengeId,
      response: assertion,
    });
    expect(first.status).toBe(200);

    const replay = await post("/auth/login/verify", {
      challengeId: options.json.challengeId,
      response: assertion,
    });
    expect(replay.status).toBe(400);
    expect(replay.json.code).toBe("challenge_expired");
  });

  it("молчит о том, есть ли аккаунт с этим адресом", async () => {
    const unknown = await post("/auth/login/options", { email: `нет-${email}` });
    expect(unknown.status).toBe(200);
    expect(unknown.json.options.challenge).toBeTruthy();
  });

  it("не пускает к состоянию без сессии", async () => {
    expect((await call("/state")).status).toBe(401);
    expect((await call("/state", { token: "definitely-not-a-token" })).status).toBe(401);
  });

  it("хранит документ состояния и нумерует ревизии", async () => {
    const written = await call("/state", {
      method: "PUT",
      token,
      body: JSON.stringify({ revision: 0, body: { version: 2, topics: ["первая"] } }),
    });
    expect(written.status).toBe(200);
    expect(written.json.revision).toBe(1);

    const read = await call("/state", { token });
    expect(read.status).toBe(200);
    expect(read.json.revision).toBe(1);
    expect(read.json.body.topics).toEqual(["первая"]);
  });

  it("отклоняет запись поверх более новой ревизии", async () => {
    const stale = await call("/state", {
      method: "PUT",
      token,
      body: JSON.stringify({ revision: 0, body: { version: 2, topics: [] } }),
    });
    expect(stale.status).toBe(409);

    const unchanged = await call("/state", { token });
    expect(unchanged.json.body.topics).toEqual(["первая"]);
  });

  it("гасит сессию при выходе", async () => {
    expect((await post("/auth/logout", {}, token)).status).toBe(200);
    expect((await call("/state", { token })).status).toBe(401);
    expect((await call("/auth/me", { token })).status).toBe(401);
  });

  it("лишний слэш — это опечатка, а не другой ресурс", async () => {
    const response = await fetch(`${BASE}/state/`, { redirect: "manual" });
    expect([301, 308]).toContain(response.status);
  });

  it("отдаёт assetlinks для Android", async () => {
    const links = await call("/.well-known/assetlinks.json");
    expect(links.status).toBe(200);
    expect(Array.isArray(links.json)).toBe(true);
  });
});
