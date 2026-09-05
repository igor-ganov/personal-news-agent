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
  let jobId = "";
  let inviteUrl = "";
  let secondToken = "";

  /** The shape `topicContextOf` produces — what every prompt builder walks. */
  const probeContext = () => {
    const topic = {
      id: "topic_probe",
      parentId: null,
      title: "Проба",
      brief: "Проверка связки",
      focusAreas: [],
      excludes: [],
      language: "ru",
      level: "intermediate",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return {
      topic,
      path: [topic],
      focusAreas: [],
      excludes: [],
      language: "ru",
      level: "intermediate",
    };
  };

  interface LiveJob {
    readonly id: string;
    readonly status: string;
    readonly error: { readonly message: string } | null;
  }

  /**
   * Waits for a job to leave the state it was submitted in.
   *
   * Generation runs after the response, so the test asks again rather than
   * assuming the queue moved on by itself — and gives up rather than hanging.
   */
  const pollJob = async (
    id: string,
    done: (job: LiveJob) => boolean,
    attempts = 20,
  ): Promise<LiveJob | null> => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await raw(`/jobs/${id}`, { token });
      const job = response.json?.job as LiveJob | undefined;
      if (job && done(job)) return job;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  };

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

  it("без ключа API задание падает с внятной ошибкой, а не молча", async () => {
    const submitted = await raw("/jobs", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "sources:topic_probe",
        kind: "sources",
        input: {
          context: probeContext(),
          known: [],
          blockedHosts: [],
          limit: 3,
          now: new Date().toISOString(),
        },
        meta: { topicId: "topic_probe" },
      }),
    });

    expect(submitted.status).toBe(202);
    expect(submitted.json.job.status).toBe("queued");
    jobId = submitted.json.job.id;

    // Постановка отвечает сразу, генерация идёт после ответа.
    const listed = await pollJob(jobId, (job) => job.status !== "queued");
    expect(["failed", "running"]).toContain(listed?.status);
  });

  it("не берётся за неизвестный вид задания", async () => {
    const bad = await raw("/jobs", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "x", kind: "lecture", input: {} }),
    });

    expect(bad.status).toBe(400);
  });

  it("одно живое задание на ключ, сколько бы устройств ни просило", async () => {
    const key = "digest:topic_probe:week";
    const body = JSON.stringify({
      key,
      kind: "digest",
      input: { now: new Date().toISOString() },
      meta: { topicId: "topic_probe" },
    });
    const headers = { "Content-Type": "application/json" };

    // Два устройства просят одно и то же одновременно.
    const [first, second] = await Promise.all([
      raw("/jobs", { method: "POST", token, headers, body }),
      raw("/jobs", { method: "POST", token, headers, body }),
    ]);
    expect([first.status, second.status]).toEqual([202, 202]);

    const listed = await raw("/jobs", { token });
    const live = (listed.json.jobs as Array<{ key: string; status: string; id: string }>).filter(
      (job) => job.key === key && (job.status === "queued" || job.status === "running"),
    );
    expect(live.length).toBeLessThanOrEqual(1);

    for (const job of listed.json.jobs as Array<{ key: string; id: string }>) {
      if (job.key === key) await raw(`/jobs/${job.id}`, { method: "DELETE", token });
    }
  });

  it("задание исчезает, когда приложение с ним закончило", async () => {
    expect((await raw(`/jobs/${jobId}`, { method: "DELETE", token })).status).toBe(200);

    const listed = await raw("/jobs", { token });
    expect(listed.json.jobs.some((job: { id: string }) => job.id === jobId)).toBe(false);
  });

  it("говорит, чем сервер может генерировать", async () => {
    const status = await raw("/provider-key", { token });

    expect(status.status).toBe(200);
    expect(typeof status.json.configured).toBe("boolean");
    expect(status.json.ownKey).toBe(false);
  });

  /**
   * Проверяет то, что нельзя проверить без выхода наружу: воркер действительно
   * доходит до вызова модели. Ключ заведомо неверный — ответом будет 401 от
   * Anthropic, платить не за что. Включается PNA_LIVE_MODEL=1.
   */
  it.skipIf(process.env.PNA_LIVE_MODEL !== "1")(
    "с ключом аккаунта задание доходит до модели и возвращает её ошибку",
    async () => {
      const saved = await raw("/provider-key", {
        method: "PUT",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-ant-obviously-invalid", model: "claude-opus-5" }),
      });
      expect(saved.status).toBe(200);
      expect(saved.json.ownKey).toBe(true);

      const submitted = await raw("/jobs", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "sources:topic_model",
          kind: "sources",
          input: {
            context: probeContext(),
            known: [],
            blockedHosts: [],
            limit: 3,
            now: new Date().toISOString(),
          },
          meta: { topicId: "topic_model" },
        }),
      });

      const finished = await pollJob(submitted.json.job.id, (job) => job.status === "failed", 60);
      expect(finished?.error?.message).toMatch(/Ключ API отклонён|Ошибка API/);

      await raw(`/jobs/${submitted.json.job.id}`, { method: "DELETE", token });
      await raw("/provider-key", { method: "DELETE", token });
    },
    30_000,
  );

  it("выдаёт одноразовую ссылку на добавление устройства", async () => {
    const minted = await raw("/auth/invite", { method: "POST", token });

    expect(minted.status).toBe(200);
    expect(minted.json.url).toContain("/enroll#t=");
    expect(minted.json.expiresAt > new Date().toISOString()).toBe(true);
    inviteUrl = minted.json.url;
  });

  it("страница добавления открывается и не тянет чужие скрипты", async () => {
    const page = await fetch(`${BASE}/enroll`);
    const csp = page.headers.get("content-security-policy") ?? "";

    expect(page.status).toBe(200);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    // Токен живёт во фрагменте: до сервера он не доезжает, значит и в отданной
    // странице его быть не может — она одна и та же для любой ссылки.
    const token = new URLSearchParams(new URL(inviteUrl).hash.slice(1)).get("t") ?? "";
    expect(token.length).toBeGreaterThan(20);
    expect(await page.text()).not.toContain(token);
  });

  it("второе устройство заводит по ссылке свой ключ в том же аккаунте", async () => {
    const second = virtualPasskeyAgent({
      rpId,
      origin: process.env.PNA_API_ORIGIN ?? `https://${rpId}`,
    });
    const inviteToken = new URLSearchParams(new URL(inviteUrl).hash.slice(1)).get("t") ?? "";

    const started = await raw("/auth/invite/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    });
    expect(started.status).toBe(200);

    const created = await second.create(started.json.options);

    const done = await raw("/auth/invite/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: inviteToken,
        challengeId: started.json.challengeId,
        response: created,
        label: "Второе устройство",
      }),
    });

    expect(done.status).toBe(200);
    expect(done.json.account.email).toBe(email);
    // Ссылка отдаёт и сессию: устройство сразу в аккаунте, без отдельного входа.
    expect(typeof done.json.token).toBe("string");
    secondToken = done.json.token;

    const details = await raw("/auth/me", { token: secondToken });
    expect(details.json.passkeys).toHaveLength(2);
  });

  it("ссылка срабатывает ровно один раз", async () => {
    const inviteToken = new URLSearchParams(new URL(inviteUrl).hash.slice(1)).get("t") ?? "";
    const again = await raw("/auth/invite/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken }),
    });

    expect(again.status).toBe(400);
    expect(again.json.code).toBe("invite_invalid");
  });

  it("данные аккаунта видны второму устройству", async () => {
    const seen = await raw("/state", { token: secondToken });

    expect(seen.status).toBe(200);
    expect((seen.json.body as { topics: string[] }).topics).toEqual(["первая"]);
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
