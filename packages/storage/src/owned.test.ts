import { accountId, accountOwner, emptyState, LOCAL_OWNER, topicId, type AppState } from "@pna/core";
import { makeTopic } from "@pna/core/testing";
import { describe, expect, it } from "vitest";
import { memoryStore } from "./adapters/memory.js";
import { createOwnedRepository } from "./owned.js";
import { stateKeyFor } from "./repository.js";

const OWNER = accountOwner(accountId("acc-1"));

const withTopic = (state: AppState, title: string): AppState => ({
  ...state,
  topics: { [topicId("t1")]: makeTopic({ id: topicId("t1"), title }) },
});

describe("createOwnedRepository", () => {
  it("по умолчанию работает с локальным документом", async () => {
    const kv = memoryStore();
    const repository = createOwnedRepository(kv);

    await repository.save(withTopic(emptyState(), "Локальная"));

    expect(repository.owner()).toEqual(LOCAL_OWNER);
    expect(await kv.get(stateKeyFor(LOCAL_OWNER))).toContain("Локальная");
  });

  it("после переключения пишет в документ аккаунта", async () => {
    const kv = memoryStore();
    const repository = createOwnedRepository(kv);
    await repository.save(withTopic(emptyState(), "Локальная"));

    repository.use(OWNER);
    await repository.save(withTopic(emptyState(OWNER), "Аккаунтная"));

    expect(await kv.get(stateKeyFor(LOCAL_OWNER))).toContain("Локальная");
    expect(await kv.get(stateKeyFor(OWNER))).toContain("Аккаунтная");
  });

  it("для нового владельца документа ещё нет — это не ошибка", async () => {
    const repository = createOwnedRepository(memoryStore());
    repository.use(OWNER);

    expect(await repository.load()).toEqual({ ok: true, value: null });
  });

  it("даёт добраться до чужого документа, не переключаясь на него", async () => {
    const repository = createOwnedRepository(memoryStore());
    await repository.of(OWNER).save(withTopic(emptyState(OWNER), "Аккаунтная"));

    expect(repository.owner()).toEqual(LOCAL_OWNER);
    expect(await repository.load()).toEqual({ ok: true, value: null });

    const account = await repository.of(OWNER).load();
    expect(account.ok && account.value?.topics[topicId("t1")]?.title).toBe("Аккаунтная");
  });

  it("возвращает один и тот же экземпляр для одного владельца", () => {
    const repository = createOwnedRepository(memoryStore());
    expect(repository.of(OWNER)).toBe(repository.of(accountOwner(accountId("acc-1"))));
  });

  it("выход возвращает к локальному документу без потери данных аккаунта", async () => {
    const kv = memoryStore();
    const repository = createOwnedRepository(kv);
    repository.use(OWNER);
    await repository.save(withTopic(emptyState(OWNER), "Аккаунтная"));

    repository.use(LOCAL_OWNER);

    expect(await repository.load()).toEqual({ ok: true, value: null });
    expect(await kv.get(stateKeyFor(OWNER))).toContain("Аккаунтная");
  });

  it("очистка трогает документ только текущего владельца", async () => {
    const kv = memoryStore();
    const repository = createOwnedRepository(kv);
    await repository.save(withTopic(emptyState(), "Локальная"));
    repository.use(OWNER);
    await repository.save(withTopic(emptyState(OWNER), "Аккаунтная"));

    await repository.clear();

    expect(await kv.get(stateKeyFor(OWNER))).toBeNull();
    expect(await kv.get(stateKeyFor(LOCAL_OWNER))).toContain("Локальная");
  });
});
