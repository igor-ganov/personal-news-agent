import { accountId, fixedClock, instantOf } from "@pna/core";
import { memoryStore } from "@pna/storage";
import { describe, expect, it } from "vitest";
import type { AuthSession } from "./client.js";
import { createSessionStore, SESSION_KEY } from "./session.js";

const NOW = instantOf("2026-08-22T10:00:00.000Z");
const clock = fixedClock(NOW);

const session = (expiresAt: string): AuthSession => ({
  token: "tok",
  expiresAt: instantOf(expiresAt),
  account: {
    id: accountId("acc-1"),
    email: "reader@example.com",
    emailVerified: false,
    displayName: "reader@example.com",
    createdAt: instantOf("2026-08-01T10:00:00.000Z"),
  },
});

describe("createSessionStore", () => {
  it("на чистом устройстве сессии нет", async () => {
    const store = createSessionStore(memoryStore(), clock);
    expect(await store.load()).toBeNull();
  });

  it("возвращает сохранённую сессию целиком", async () => {
    const store = createSessionStore(memoryStore(), clock);
    const saved = session("2026-09-22T10:00:00.000Z");

    await store.save(saved);

    expect(await store.load()).toEqual(saved);
  });

  it("просроченный токен не выдаёт за действующую сессию", async () => {
    const kv = memoryStore();
    const store = createSessionStore(kv, clock);

    await store.save(session("2026-08-22T09:59:59.000Z"));

    expect(await store.load()).toBeNull();
    expect(await kv.get(SESSION_KEY)).toBeNull();
  });

  it("истекающая ровно сейчас сессия считается истёкшей", async () => {
    const store = createSessionStore(memoryStore(), clock);
    await store.save(session(NOW));
    expect(await store.load()).toBeNull();
  });

  it("испорченная запись читается как «не вошёл» и удаляется", async () => {
    const kv = memoryStore();
    await kv.set(SESSION_KEY, "{это не json");
    const store = createSessionStore(kv, clock);

    expect(await store.load()).toBeNull();
    expect(await kv.get(SESSION_KEY)).toBeNull();
  });

  it("неполная запись тоже не считается сессией", async () => {
    const kv = memoryStore();
    await kv.set(SESSION_KEY, JSON.stringify({ token: "tok" }));
    const store = createSessionStore(kv, clock);

    expect(await store.load()).toBeNull();
  });

  it("выход стирает запись", async () => {
    const kv = memoryStore();
    const store = createSessionStore(kv, clock);
    await store.save(session("2026-09-22T10:00:00.000Z"));

    await store.clear();

    expect(await kv.get(SESSION_KEY)).toBeNull();
    expect(await store.load()).toBeNull();
  });
});
