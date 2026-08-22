import { authError, createSessionStore, type SessionStore } from "@pna/auth";
import {
  accountId,
  accountOwner,
  emptyState,
  fixedClock,
  instantOf,
  LOCAL_OWNER,
  topicId,
  type AppState,
} from "@pna/core";
import { makeTopic } from "@pna/core/testing";
import { createOwnedRepository, memoryStore, type KeyValueStore } from "@pna/storage";
import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "../store.js";
import { fakeAuthClient, type FakeAuth } from "../testing/fake-auth.js";
import { createAccountService, type AccountService } from "./account.js";

const NOW = instantOf("2026-08-22T10:00:00.000Z");

const stateWith = (...ids: string[]): AppState => ({
  ...emptyState(),
  topics: Object.fromEntries(
    ids.map((id) => [topicId(id), makeTopic({ id: topicId(id), title: id })]),
  ) as AppState["topics"],
});

const titles = (state: AppState): string[] => Object.keys(state.topics).sort();

interface Setup {
  readonly service: AccountService;
  readonly auth: FakeAuth;
  readonly kv: KeyValueStore;
  readonly sessions: SessionStore;
  readonly repository: ReturnType<typeof createOwnedRepository>;
  state(): AppState;
}

const setup = (options: { local?: AppState; auth?: FakeAuth } = {}): Setup => {
  const kv = memoryStore();
  const auth = options.auth ?? fakeAuthClient();
  const repository = createOwnedRepository(kv);
  const store = createStore(options.local ?? emptyState());
  const sessions = createSessionStore(kv, fixedClock(NOW));

  return {
    auth,
    kv,
    sessions,
    repository,
    service: createAccountService({ client: auth.client, sessions, repository, store }),
    state: () => store.getState(),
  };
};

describe("регистрация", () => {
  let s: Setup;

  beforeEach(async () => {
    s = setup({ local: stateWith("t_local") });
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));
  });

  it("не спрашивает ни о чём: у нового аккаунта данных нет", async () => {
    const result = await s.service.register({ email: "reader@example.com" });

    expect(result.ok && result.value.kind).toBe("signed-in");
  });

  it("переносит локальные данные в аккаунт", async () => {
    await s.service.register({ email: "reader@example.com" });

    expect(s.state().owner).toEqual(accountOwner(s.auth.account.id));
    expect(titles(s.state())).toEqual(["t_local"]);
  });

  it("отправляет перенесённые данные на сервер", async () => {
    await s.service.register({ email: "reader@example.com" });

    const remote = s.auth.document();
    expect(remote.revision).toBe(1);
    expect(titles(remote.body as AppState)).toEqual(["t_local"]);
  });

  it("опустошает локальный документ, чтобы данные не всплыли после выхода", async () => {
    await s.service.register({ email: "reader@example.com" });

    const local = await s.repository.of(LOCAL_OWNER).load();
    expect(local.ok && local.value && titles(local.value)).toEqual([]);
    expect(local.ok && local.value?.owner).toEqual(LOCAL_OWNER);
  });

  it("сохраняет сессию до следующего запуска", async () => {
    await s.service.register({ email: "reader@example.com" });

    expect((await s.sessions.load())?.token).toBe("tok");
  });

  it("ошибка регистрации не трогает данные", async () => {
    const auth = fakeAuthClient({ failures: { register: authError("email_taken", "Занято") } });
    const failing = setup({ local: stateWith("t_local"), auth });

    const result = await failing.service.register({ email: "reader@example.com" });

    expect(result.ok === false && result.error.kind).toBe("email_taken");
    expect(failing.state().owner).toEqual(LOCAL_OWNER);
    expect(await failing.sessions.load()).toBeNull();
  });
});

describe("вход, когда данные есть с обеих сторон", () => {
  const remote = stateWith("t_remote");

  const withBoth = (): Setup => {
    const auth = fakeAuthClient();
    auth.setDocument(remote, 3);
    const s = setup({ local: stateWith("t_local"), auth });
    return s;
  };

  it("останавливается и спрашивает", async () => {
    const s = withBoth();
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));

    const result = await s.service.signIn({ email: "reader@example.com" });

    expect(result.ok && result.value.kind).toBe("needs-choice");
    expect(result.ok && result.value.kind === "needs-choice" && result.value.pending.summary.suggested).toBe(
      "merge",
    );
  });

  it("до ответа ничего не меняет", async () => {
    const s = withBoth();
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));

    await s.service.signIn({ email: "reader@example.com" });

    expect(s.state().owner).toEqual(LOCAL_OWNER);
    expect(await s.sessions.load()).toBeNull();
    expect(s.auth.document().revision).toBe(3);
  });

  it("объединение сохраняет обе стороны", async () => {
    const s = withBoth();
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));
    const result = await s.service.signIn({ email: "reader@example.com" });
    if (!(result.ok && result.value.kind === "needs-choice")) throw new Error("ожидался вопрос");

    await s.service.resolveClaim(result.value.pending, "merge");

    expect(titles(s.state())).toEqual(["t_local", "t_remote"]);
    expect(titles(s.auth.document().body as AppState)).toEqual(["t_local", "t_remote"]);
  });

  it("«оставить аккаунтные» отбрасывает локальные", async () => {
    const s = withBoth();
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));
    const result = await s.service.signIn({ email: "reader@example.com" });
    if (!(result.ok && result.value.kind === "needs-choice")) throw new Error("ожидался вопрос");

    await s.service.resolveClaim(result.value.pending, "keep-account");

    expect(titles(s.state())).toEqual(["t_remote"]);
  });

  it("«оставить локальные» отбрасывает аккаунтные", async () => {
    const s = withBoth();
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));
    const result = await s.service.signIn({ email: "reader@example.com" });
    if (!(result.ok && result.value.kind === "needs-choice")) throw new Error("ожидался вопрос");

    await s.service.resolveClaim(result.value.pending, "keep-local");

    expect(titles(s.state())).toEqual(["t_local"]);
    expect(titles(s.auth.document().body as AppState)).toEqual(["t_local"]);
  });
});

describe("вход на чистом устройстве", () => {
  it("просто забирает данные аккаунта", async () => {
    const auth = fakeAuthClient();
    auth.setDocument(stateWith("t_remote"), 5);
    const s = setup({ auth });

    const result = await s.service.signIn({ email: "reader@example.com" });

    expect(result.ok && result.value.kind).toBe("signed-in");
    expect(titles(s.state())).toEqual(["t_remote"]);
  });

  it("документ аккаунта, сохранённый на этом устройстве, не теряется при пустом сервере", async () => {
    const auth = fakeAuthClient();
    const s = setup({ auth });
    await s.repository.of(accountOwner(auth.account.id)).save(stateWith("t_cached"));

    await s.service.signIn({ email: "reader@example.com" });

    expect(titles(s.state())).toEqual(["t_cached"]);
  });

  it("нечитаемый документ сервера не ломает вход", async () => {
    const auth = fakeAuthClient();
    auth.setDocument({ version: 99, topics: {} }, 2);
    const s = setup({ auth });

    const result = await s.service.signIn({ email: "reader@example.com" });

    expect(result.ok && result.value.kind).toBe("signed-in");
  });
});

describe("восстановление сессии", () => {
  it("на пустом устройстве сессии нет", async () => {
    const s = setup();
    expect(await s.service.restore()).toBeNull();
  });

  it("поднимает данные того аккаунта, чья сессия сохранена", async () => {
    const auth = fakeAuthClient();
    const s = setup({ auth });
    await s.sessions.save(auth.session());
    await s.repository.of(accountOwner(auth.account.id)).save(stateWith("t_account"));

    const restored = await s.service.restore();

    expect(restored?.account.email).toBe("reader@example.com");
    expect(titles(s.state())).toEqual(["t_account"]);
    expect(s.service.current()?.token).toBe("tok");
  });
});

describe("выход", () => {
  it("возвращает приложение к локальным данным", async () => {
    const auth = fakeAuthClient();
    const s = setup({ local: stateWith("t_local"), auth });
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));
    await s.service.register({ email: "reader@example.com" });

    await s.service.signOut();

    expect(s.state().owner).toEqual(LOCAL_OWNER);
    expect(titles(s.state())).toEqual([]);
    expect(await s.sessions.load()).toBeNull();
    expect(s.service.current()).toBeNull();
  });

  it("данные аккаунта остаются на устройстве до следующего входа", async () => {
    const auth = fakeAuthClient();
    const s = setup({ local: stateWith("t_local"), auth });
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));
    await s.service.register({ email: "reader@example.com" });

    await s.service.signOut();

    const kept = await s.repository.of(accountOwner(auth.account.id)).load();
    expect(kept.ok && kept.value && titles(kept.value)).toEqual(["t_local"]);
  });

  it("сообщает серверу, что сессия больше не нужна", async () => {
    const auth = fakeAuthClient();
    const s = setup({ auth });
    await s.service.register({ email: "reader@example.com" });

    await s.service.signOut();

    expect(auth.calls()).toContain("logout");
  });
});

describe("синхронизация", () => {
  it("без аккаунта это не ошибка, а просто «нечего делать»", async () => {
    const s = setup();
    expect(await s.service.sync()).toEqual({ ok: true, value: { kind: "offline" } });
  });

  it("забирает чужие изменения и отправляет свои", async () => {
    const auth = fakeAuthClient();
    const s = setup({ auth });
    await s.service.register({ email: "reader@example.com" });

    // Другое устройство успело записать свою тему.
    auth.setDocument(stateWith("t_other"), s.auth.document().revision);
    await s.service.sync();

    expect(titles(s.state())).toContain("t_other");
    expect(titles(s.auth.document().body as AppState)).toContain("t_other");
  });

  it("расхождение ревизий разрешается повторной отправкой, а не потерей данных", async () => {
    const auth = fakeAuthClient();
    const s = setup({ local: stateWith("t_local"), auth });
    await s.repository.of(LOCAL_OWNER).save(stateWith("t_local"));
    await s.service.register({ email: "reader@example.com" });

    // Ревизия на сервере ушла вперёд уже после того, как мы её прочитали.
    auth.setDocument(stateWith("t_other"), 9);

    const result = await s.service.sync();

    expect(result.ok && result.value.kind).toBe("synced");
    expect(titles(s.auth.document().body as AppState)).toEqual(["t_local", "t_other"]);
  });

  it("сетевая ошибка остаётся ошибкой", async () => {
    const auth = fakeAuthClient({ failures: { pull: authError("network", "Нет связи") } });
    const s = setup({ auth });
    await s.sessions.save(auth.session());
    await s.service.restore();

    const result = await s.service.sync();

    expect(result.ok === false && result.error.kind).toBe("network");
  });
});

describe("два аккаунта на одном устройстве", () => {
  it("не видят данных друг друга", async () => {
    const kv = memoryStore();
    const repository = createOwnedRepository(kv);
    const store = createStore(stateWith("t_first"));
    const sessions = createSessionStore(kv, fixedClock(NOW));
    await repository.of(LOCAL_OWNER).save(stateWith("t_first"));

    const first = fakeAuthClient();
    const firstService = createAccountService({ client: first.client, sessions, repository, store });
    await firstService.register({ email: "first@example.com" });
    await firstService.signOut();

    const second = fakeAuthClient({ account: { id: accountId("acc-2"), email: "second@example.com" } });
    const secondService = createAccountService({ client: second.client, sessions, repository, store });
    await secondService.register({ email: "second@example.com" });

    expect(titles(store.getState())).toEqual([]);
    const kept = await repository.of(accountOwner(first.account.id)).load();
    expect(kept.ok && kept.value && titles(kept.value)).toEqual(["t_first"]);
  });
});
