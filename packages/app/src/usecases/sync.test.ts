import { describe, expect, it, vi } from "vitest";
import { harness } from "../testing/harness.js";
import { fakeAuthClient } from "../testing/fake-auth.js";
import { createAccountService } from "./account.js";
import { startAutoSync, syncNow } from "./sync.js";
import { addTopic } from "./topics.js";
import { createOwnedRepository, memoryStore } from "@pna/storage";
import { createSessionStore } from "@pna/auth";

/**
 * A context signed into a fake account, with the sync pushed through a store we
 * can inspect. The clock is real here on purpose: the debounce is the behaviour
 * under test, and vitest's fake timers drive it.
 */
const signedIn = async () => {
  const h = harness();
  const auth = fakeAuthClient();
  const kv = memoryStore();
  const service = createAccountService({
    client: auth.client,
    sessions: createSessionStore(kv),
    repository: createOwnedRepository(kv),
    store: h.ctx.store,
  });
  await service.register({ email: "reader@example.com" });

  const ctx = { ...h.ctx, deps: { ...h.ctx.deps, account: service } };
  return { ...h, ctx, auth };
};

describe("startAutoSync", () => {
  it("pushes a change without anyone pressing sync", async () => {
    vi.useFakeTimers();
    try {
      const { ctx, auth } = await signedIn();
      const stop = startAutoSync(ctx, { delayMs: 100, minIntervalMs: 100 });
      await vi.advanceTimersByTimeAsync(200);

      const before = auth.calls().filter((call) => call.startsWith("push")).length;
      addTopic(ctx, { parentId: null, title: "Инференс" });
      await vi.advanceTimersByTimeAsync(300);
      stop();

      const after = auth.calls().filter((call) => call.startsWith("push")).length;
      expect(after).toBeGreaterThan(before);
      expect((auth.document().body as { topics: Record<string, unknown> }).topics).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a burst of edits costs one push, not one per keystroke", async () => {
    vi.useFakeTimers();
    try {
      const { ctx, auth } = await signedIn();
      const stop = startAutoSync(ctx, { delayMs: 100, minIntervalMs: 1_000 });
      await vi.advanceTimersByTimeAsync(150);
      const before = auth.calls().filter((call) => call.startsWith("push")).length;

      for (let i = 0; i < 5; i += 1) {
        addTopic(ctx, { parentId: null, title: `Тема ${i}` });
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.advanceTimersByTimeAsync(1_200);
      stop();

      const pushes = auth.calls().filter((call) => call.startsWith("push")).length - before;
      expect(pushes).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing at all without an account", async () => {
    vi.useFakeTimers();
    try {
      const { ctx } = harness();
      const stop = startAutoSync(ctx, { delayMs: 10 });
      addTopic(ctx, { parentId: null, title: "Локальная" });
      await vi.advanceTimersByTimeAsync(100);
      stop();
      // Nothing to assert beyond the absence of a crash: there is no service to
      // call, and the app must stay a working offline app.
      expect(ctx.deps.account).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops when told to", async () => {
    vi.useFakeTimers();
    try {
      const { ctx, auth } = await signedIn();
      const stop = startAutoSync(ctx, { delayMs: 50, minIntervalMs: 50 });
      await vi.advanceTimersByTimeAsync(100);
      stop();

      const before = auth.calls().length;
      addTopic(ctx, { parentId: null, title: "После остановки" });
      await vi.advanceTimersByTimeAsync(500);
      expect(auth.calls().length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("syncNow", () => {
  it("докладывает, что синхронизация прошла", async () => {
    const { ctx } = await signedIn();
    expect(await syncNow(ctx)).toBe("synced");
  });

  it("без аккаунта просто говорит, что синхронизировать не с чем", async () => {
    const { ctx } = harness();
    expect(await syncNow(ctx)).toBe("offline");
  });

  it("возвращает причину неудачи, а не молчит", async () => {
    const { ctx, auth } = await signedIn();
    auth.setFailure("pull", { kind: "network", message: "Сервер недоступен" });

    // Пустой экран у вошедшего пользователя неотличим от потери данных —
    // приложению нужна причина, чтобы её показать.
    expect(await syncNow(ctx)).toBe("Сервер недоступен");
  });
});
