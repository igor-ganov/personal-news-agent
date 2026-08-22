import { err, ok, type Result } from "@pna/core";
import { describe, expect, it } from "vitest";
import { createAuthClient } from "./client.js";
import { authError, type AuthError } from "./errors.js";
import type { PasskeyAgent } from "./ports/passkeys.js";
import { virtualPasskeyAgent } from "./testing/virtual-agent.js";
import type { RequestOptions, Transport } from "./transport.js";

const RP_ID = "api.example";
const ORIGIN = `https://${RP_ID}`;

type Route = (body: unknown, options: RequestOptions) => Result<unknown, AuthError>;

interface Recorded {
  readonly route: string;
  readonly body: unknown;
  readonly token: string | null | undefined;
}

const stubTransport = (routes: Record<string, Route>) => {
  const calls: Recorded[] = [];
  const transport: Transport = {
    baseUrl: ORIGIN,
    async request(path, options = {}) {
      const route = `${options.method ?? "GET"} ${path}`;
      calls.push({ route, body: options.body, token: options.token });
      const handler = routes[route];
      if (!handler) return err(authError("server", `Нет заглушки для ${route}`)) as never;
      return handler(options.body, options) as never;
    },
  };
  return { transport, calls, routes: () => calls.map((c) => c.route) };
};

const ACCOUNT = {
  id: "acc-1",
  email: "reader@example.com",
  emailVerified: false,
  displayName: "reader@example.com",
  createdAt: "2026-08-22T10:00:00.000Z",
};

const creationOptions = {
  challenge: "Y2hhbGxlbmdl",
  rp: { id: RP_ID, name: "PNA" },
  user: { id: "dXNlcg", name: ACCOUNT.email, displayName: ACCOUNT.email },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
};

const requestOptions = { challenge: "Y2hhbGxlbmdl", rpId: RP_ID, allowCredentials: [] };

const agent = (): PasskeyAgent => virtualPasskeyAgent({ rpId: RP_ID, origin: ORIGIN });

describe("регистрация", () => {
  const routes = (): Record<string, Route> => ({
    "POST /auth/register/options": () => ok({ challengeId: "ch-1", options: creationOptions }),
    "POST /auth/register/verify": () =>
      ok({ token: "tok", expiresAt: "2026-09-22T10:00:00.000Z", account: ACCOUNT }),
  });

  it("отдаёт сессию с разобранным аккаунтом", async () => {
    const stub = stubTransport(routes());
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.register({ email: "Reader@Example.com ", label: "Телефон" });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.token).toBe("tok");
    expect(result.ok && result.value.account.email).toBe("reader@example.com");
    expect(result.ok && result.value.account.emailVerified).toBe(false);
  });

  it("приводит адрес к общему виду до отправки", async () => {
    const stub = stubTransport(routes());
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    await client.register({ email: "  Reader@Example.COM " });

    expect(stub.calls[0]?.body).toEqual({ email: "reader@example.com" });
  });

  it("возвращает подписанный ключом ответ вместе с меткой", async () => {
    const stub = stubTransport(routes());
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    await client.register({ email: ACCOUNT.email, label: "Телефон" });

    const verify = stub.calls[1]?.body as { challengeId: string; label: string; response: { id: string } };
    expect(verify.challengeId).toBe("ch-1");
    expect(verify.label).toBe("Телефон");
    expect(verify.response.id).toBeTruthy();
  });

  it("не ходит на сервер с явно неверным адресом", async () => {
    const stub = stubTransport(routes());
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.register({ email: "не почта" });

    expect(result.ok === false && result.error.kind).toBe("invalid");
    expect(stub.calls).toHaveLength(0);
  });

  it("отменённый ключ — это отмена, а не ошибка сервера", async () => {
    const stub = stubTransport(routes());
    const client = createAuthClient({
      transport: stub.transport,
      passkeys: virtualPasskeyAgent({ rpId: RP_ID, origin: ORIGIN, refuse: true }),
    });

    const result = await client.register({ email: ACCOUNT.email });

    expect(result.ok === false && result.error.kind).toBe("cancelled");
    expect(stub.routes()).toEqual(["POST /auth/register/options"]);
  });

  it("занятый адрес доходит до вызывающего как есть", async () => {
    const stub = stubTransport({
      "POST /auth/register/options": () => err(authError("email_taken", "Уже есть")),
    });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.register({ email: ACCOUNT.email });

    expect(result.ok === false && result.error.kind).toBe("email_taken");
  });
});

describe("вход", () => {
  const loginRoutes = (): Record<string, Route> => ({
    "POST /auth/login/options": () => ok({ challengeId: "ch-2", options: requestOptions }),
    "POST /auth/login/verify": () =>
      ok({ token: "tok-2", expiresAt: "2026-09-22T10:00:00.000Z", account: ACCOUNT }),
  });

  it("работает без адреса — ключ сам называет аккаунт", async () => {
    const stub = stubTransport(loginRoutes());
    const passkeys = agent();
    await passkeys.create(creationOptions);
    const client = createAuthClient({ transport: stub.transport, passkeys });

    const result = await client.login();

    expect(result.ok && result.value.token).toBe("tok-2");
    expect(stub.calls[0]?.body).toEqual({});
  });

  it("с адресом отправляет его нормализованным", async () => {
    const stub = stubTransport(loginRoutes());
    const passkeys = agent();
    await passkeys.create(creationOptions);
    const client = createAuthClient({ transport: stub.transport, passkeys });

    await client.login({ email: "Reader@Example.com" });

    expect(stub.calls[0]?.body).toEqual({ email: "reader@example.com" });
  });

  it("отсутствие подходящего ключа не выглядит как сбой сервера", async () => {
    const stub = stubTransport(loginRoutes());
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.login({ email: ACCOUNT.email });

    expect(result.ok === false && result.error.kind).toBe("cancelled");
  });

  it("отказ сервера в проверке остаётся отказом в доступе", async () => {
    const passkeys = agent();
    await passkeys.create(creationOptions);
    const stub = stubTransport({
      "POST /auth/login/options": () => ok({ challengeId: "ch-2", options: requestOptions }),
      "POST /auth/login/verify": () => err(authError("unauthorized", "Ключ не подтверждён")),
    });
    const client = createAuthClient({ transport: stub.transport, passkeys });

    const result = await client.login({ email: ACCOUNT.email });

    expect(result.ok === false && result.error.kind).toBe("unauthorized");
  });
});

describe("сведения об аккаунте", () => {
  it("разбирает список ключей", async () => {
    const stub = stubTransport({
      "GET /auth/me": () =>
        ok({
          account: ACCOUNT,
          passkeys: [
            {
              credentialId: "cred-1",
              label: "Телефон",
              createdAt: "2026-08-22T10:00:00.000Z",
              lastUsedAt: null,
            },
          ],
        }),
    });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.me("tok");

    expect(result.ok && result.value.passkeys[0]?.label).toBe("Телефон");
    expect(result.ok && result.value.passkeys[0]?.lastUsedAt).toBeNull();
    expect(stub.calls[0]?.token).toBe("tok");
  });

  it("удаление ключа обращается к его адресу", async () => {
    const stub = stubTransport({ "DELETE /auth/passkeys/cred%2F1": () => ok({ ok: true }) });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    expect((await client.removePasskey("tok", "cred/1")).ok).toBe(true);
  });

  it("выход сообщает только об успехе", async () => {
    const stub = stubTransport({ "POST /auth/logout": () => ok({ ok: true }) });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    expect(await client.logout("tok")).toEqual({ ok: true, value: null });
  });
});

describe("документ состояния", () => {
  it("пустой аккаунт — это ревизия 0 без тела", async () => {
    const stub = stubTransport({ "GET /state": () => ok({ revision: 0, updatedAt: null, body: null }) });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    expect(await client.pull("tok")).toEqual({
      ok: true,
      value: { revision: 0, updatedAt: null, body: null },
    });
  });

  it("успешная запись возвращает новую ревизию", async () => {
    const stub = stubTransport({
      "PUT /state": () => ok({ revision: 4, updatedAt: "2026-08-22T10:00:00.000Z" }),
    });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.push("tok", 3, { topics: {} });

    expect(result.ok && result.value.kind).toBe("saved");
    expect(result.ok && result.value.kind === "saved" && result.value.revision).toBe(4);
    expect(stub.calls[0]?.body).toEqual({ revision: 3, body: { topics: {} } });
  });

  it("расхождение ревизий — это исход записи, а не её провал", async () => {
    const stub = stubTransport({
      "PUT /state": () =>
        err(
          authError("conflict", "Разошлось", {
            revision: 9,
            updatedAt: "2026-08-22T11:00:00.000Z",
            body: { topics: { t1: {} } },
          }),
        ),
    });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.push("tok", 3, {});

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.kind).toBe("conflict");
    expect(result.ok && result.value.kind === "conflict" && result.value.remote.revision).toBe(9);
    expect(result.ok && result.value.kind === "conflict" && result.value.remote.body).toEqual({
      topics: { t1: {} },
    });
  });

  it("сетевая ошибка при записи остаётся ошибкой", async () => {
    const stub = stubTransport({ "PUT /state": () => err(authError("network", "Нет связи")) });
    const client = createAuthClient({ transport: stub.transport, passkeys: agent() });

    const result = await client.push("tok", 3, {});

    expect(result.ok === false && result.error.kind).toBe("network");
  });
});
