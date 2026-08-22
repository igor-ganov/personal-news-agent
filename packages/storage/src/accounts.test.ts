import { accountId, emptyState, LOCAL_OWNER, STATE_VERSION, type TopicId } from "@pna/core";
import { describe, expect, it } from "vitest";
import { memoryStore } from "./adapters/memory.js";
import { decodeState, encodeState } from "./codec.js";
import { createStateRepository, stateKeyFor, STATE_KEY } from "./repository.js";

const account = accountId("acc_1");

describe("stateKeyFor", () => {
  it("leaves the pre-accounts key untouched for local data", () => {
    expect(stateKeyFor(LOCAL_OWNER)).toBe(STATE_KEY);
  });

  it("gives every account its own slot", () => {
    expect(stateKeyFor({ kind: "account", accountId: account })).toBe(`${STATE_KEY}.acc_1`);
    expect(stateKeyFor({ kind: "account", accountId: accountId("acc_2") })).not.toBe(
      stateKeyFor({ kind: "account", accountId: account }),
    );
  });
});

describe("owner round-trip", () => {
  it("keeps an account owner through encode and decode", () => {
    const state = emptyState({ kind: "account", accountId: account });
    const decoded = decodeState(encodeState(state));
    if (!decoded.ok) throw new Error("expected ok");
    expect(decoded.value.owner).toEqual({ kind: "account", accountId: "acc_1" });
  });

  it("treats a malformed owner as local rather than guessing", () => {
    for (const owner of [{ kind: "account" }, { kind: "account", accountId: "" }, "nonsense", null]) {
      const decoded = decodeState(JSON.stringify({ version: STATE_VERSION, owner }));
      if (!decoded.ok) throw new Error("expected ok");
      expect(decoded.value.owner).toEqual(LOCAL_OWNER);
    }
  });
});

describe("v1 → v2 migration", () => {
  const v1Document = JSON.stringify({
    version: 1,
    topics: { t1: { id: "t1", title: "Старая тема" } },
    settings: { sourceRefreshDays: 3 },
  });

  it("marks a pre-accounts document as local data", () => {
    const decoded = decodeState(v1Document);
    if (!decoded.ok) throw new Error("expected ok");
    expect(decoded.value.owner).toEqual(LOCAL_OWNER);
    expect(decoded.value.version).toBe(STATE_VERSION);
  });

  it("carries the old data across untouched", () => {
    const decoded = decodeState(v1Document);
    if (!decoded.ok) throw new Error("expected ok");
    expect(Object.keys(decoded.value.topics)).toEqual(["t1"]);
    expect(decoded.value.topics["t1" as TopicId]).toMatchObject({ title: "Старая тема" });
    expect(decoded.value.settings.sourceRefreshDays).toBe(3);
  });

  it("loads an existing v1 document from the key it was written under", async () => {
    const store = memoryStore({ [STATE_KEY]: v1Document });
    const loaded = await createStateRepository(store, { key: stateKeyFor(LOCAL_OWNER) }).load();
    if (!loaded.ok || !loaded.value) throw new Error("expected a state");
    expect(Object.keys(loaded.value.topics)).toEqual(["t1"]);
  });
});

describe("isolation between owners", () => {
  it("one account's data is invisible to another", async () => {
    const store = memoryStore();
    const mine = createStateRepository(store, {
      key: stateKeyFor({ kind: "account", accountId: account }),
    });
    const theirs = createStateRepository(store, {
      key: stateKeyFor({ kind: "account", accountId: accountId("acc_2") }),
    });

    await mine.save({
      ...emptyState({ kind: "account", accountId: account }),
      topics: { ["t" as TopicId]: { id: "t" } as never },
    });

    expect(await theirs.load()).toEqual({ ok: true, value: null });
    const loaded = await mine.load();
    if (!loaded.ok || !loaded.value) throw new Error("expected a state");
    expect(Object.keys(loaded.value.topics)).toEqual(["t"]);
  });

  it("signing out does not expose the account's document", async () => {
    const store = memoryStore();
    await createStateRepository(store, {
      key: stateKeyFor({ kind: "account", accountId: account }),
    }).save({
      ...emptyState({ kind: "account", accountId: account }),
      topics: { ["secret" as TopicId]: { id: "secret" } as never },
    });

    const local = await createStateRepository(store, { key: stateKeyFor(LOCAL_OWNER) }).load();
    expect(local).toEqual({ ok: true, value: null });
  });
});
