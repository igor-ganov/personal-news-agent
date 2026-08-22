import { describe, expect, it } from "vitest";
import { createTransport, type FetchLike } from "./transport.js";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const recording = (
  handler: (path: string, init: RequestInit | undefined) => Response,
): { fetch: FetchLike; calls: { path: string; init: RequestInit | undefined }[] } => {
  const calls: { path: string; init: RequestInit | undefined }[] = [];
  return {
    calls,
    fetch: async (path, init) => {
      calls.push({ path, init });
      return handler(path, init);
    },
  };
};

describe("createTransport", () => {
  it("склеивает базовый адрес и путь, не удваивая слэш", async () => {
    const stub = recording(() => jsonResponse(200, { ok: true }));
    const transport = createTransport({ baseUrl: "https://api.example/", fetch: stub.fetch });

    await transport.request("/auth/me");

    expect(stub.calls[0]?.path).toBe("https://api.example/auth/me");
    expect(transport.baseUrl).toBe("https://api.example");
  });

  it("отправляет тело как JSON и проставляет заголовок", async () => {
    const stub = recording(() => jsonResponse(200, {}));
    const transport = createTransport({ baseUrl: "https://api.example", fetch: stub.fetch });

    await transport.request("/auth/register/options", { method: "POST", body: { email: "a@b.c" } });

    const init = stub.calls[0]?.init;
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"email":"a@b.c"}');
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("не шлёт заголовок авторизации без токена", async () => {
    const stub = recording(() => jsonResponse(200, {}));
    const transport = createTransport({ baseUrl: "https://api.example", fetch: stub.fetch });

    await transport.request("/auth/me");
    await transport.request("/auth/me", { token: null });

    for (const call of stub.calls)
      expect((call.init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("передаёт токен как Bearer", async () => {
    const stub = recording(() => jsonResponse(200, {}));
    const transport = createTransport({ baseUrl: "https://api.example", fetch: stub.fetch });

    await transport.request("/auth/me", { token: "t0k3n" });

    expect((stub.calls[0]?.init?.headers as Record<string, string>).Authorization).toBe("Bearer t0k3n");
  });

  it("отдаёт разобранное тело при успехе", async () => {
    const stub = recording(() => jsonResponse(200, { account: { email: "a@b.c" } }));
    const transport = createTransport({ baseUrl: "https://api.example", fetch: stub.fetch });

    const result = await transport.request<{ account: { email: string } }>("/auth/me");

    expect(result).toEqual({ ok: true, value: { account: { email: "a@b.c" } } });
  });

  it("переводит код ошибки сервера в вид ошибки", async () => {
    const stub = recording(() => jsonResponse(409, { code: "email_taken", message: "Занято" }));
    const transport = createTransport({ baseUrl: "https://api.example", fetch: stub.fetch });

    const result = await transport.request("/auth/register/options", { method: "POST", body: {} });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.kind).toBe("email_taken");
    expect(result.ok === false && result.error.message).toBe("Занято");
  });

  it("сохраняет тело ошибки — в конфликте приезжает актуальный документ", async () => {
    const stub = recording(() =>
      jsonResponse(409, { code: "revision_conflict", message: "Разошлось", revision: 7, body: { topics: [] } }),
    );
    const transport = createTransport({ baseUrl: "https://api.example", fetch: stub.fetch });

    const result = await transport.request("/state", { method: "PUT", body: {} });

    expect(result.ok === false && result.error.details?.revision).toBe(7);
  });

  it("опирается на статус, когда кода нет", async () => {
    const stub = recording(() => new Response("<html>502</html>", { status: 502 }));
    const transport = createTransport({ baseUrl: "https://api.example", fetch: stub.fetch });

    const result = await transport.request("/auth/me");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.kind).toBe("server");
  });

  it("обрыв связи — это ошибка, а не исключение", async () => {
    const transport = createTransport({
      baseUrl: "https://api.example",
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });

    const result = await transport.request("/auth/me");

    expect(result).toEqual({ ok: false, error: { kind: "network", message: "Failed to fetch" } });
  });

  it("успешный ответ без тела не роняет разбор", async () => {
    const transport = createTransport({
      baseUrl: "https://api.example",
      fetch: async () => new Response(null, { status: 204 }),
    });

    expect(await transport.request("/auth/logout", { method: "POST" })).toEqual({ ok: true, value: {} });
  });
});
