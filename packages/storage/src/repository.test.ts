import { emptyState, type AppState } from "@pna/core";
import { describe, expect, it, vi } from "vitest";
import { memoryStore } from "./adapters/memory.js";
import { webStorageStore, type WebStorageLike } from "./adapters/web-storage.js";
import { createStateRepository, debouncedSaver, STATE_KEY } from "./repository.js";
import type { KeyValueStore } from "./ports/kv.js";

const failingStore = (error: unknown): KeyValueStore => ({
  async get() {
    throw error;
  },
  async set() {
    throw error;
  },
  async remove() {
    throw error;
  },
});

describe("createStateRepository", () => {
  it("reports a first run as null, not as an error", async () => {
    const repository = createStateRepository(memoryStore());
    expect(await repository.load()).toEqual({ ok: true, value: null });
  });

  it("round-trips through the store under a stable key", async () => {
    const store = memoryStore();
    const repository = createStateRepository(store);
    const state: AppState = { ...emptyState(), settings: { ...emptyState().settings, sourceRefreshDays: 3 } };

    expect(await repository.save(state)).toEqual({ ok: true, value: undefined });
    expect(await store.get(STATE_KEY)).not.toBeNull();

    const loaded = await repository.load();
    if (!loaded.ok || !loaded.value) throw new Error("expected a loaded state");
    expect(loaded.value.settings.sourceRefreshDays).toBe(3);
  });

  it("uses a custom key when asked", async () => {
    const store = memoryStore();
    await createStateRepository(store, { key: "other" }).save(emptyState());
    expect(await store.get("other")).not.toBeNull();
    expect(await store.get(STATE_KEY)).toBeNull();
  });

  it("surfaces corrupt data as a load error", async () => {
    const store = memoryStore({ [STATE_KEY]: "не json" });
    expect(await createStateRepository(store).load()).toMatchObject({
      ok: false,
      error: { kind: "corrupt" },
    });
  });

  it("reports a quota failure on save instead of throwing", async () => {
    const quota = new DOMException("full", "QuotaExceededError");
    const repository = createStateRepository(failingStore(quota));
    expect(await repository.save(emptyState())).toMatchObject({ ok: false, error: { kind: "quota" } });
  });

  it("reports an unreadable store on load", async () => {
    const repository = createStateRepository(failingStore(new Error("disk gone")));
    expect(await repository.load()).toEqual({
      ok: false,
      error: { kind: "unknown", message: "disk gone" },
    });
  });

  it("clears the saved document", async () => {
    const store = memoryStore();
    const repository = createStateRepository(store);
    await repository.save(emptyState());
    await repository.clear();
    expect(await store.get(STATE_KEY)).toBeNull();
  });
});

describe("webStorageStore", () => {
  const fakeStorage = (): WebStorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  };

  it("reads and writes through the underlying storage", async () => {
    const storage = fakeStorage();
    const store = webStorageStore(storage);
    await store.set("k", "v");
    expect(storage.data.get("k")).toBe("v");
    expect(await store.get("k")).toBe("v");
    await store.remove("k");
    expect(await store.get("k")).toBeNull();
  });

  it("turns a quota exception into a storage error", async () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    await expect(webStorageStore(storage).set("k", "v")).rejects.toMatchObject({ kind: "quota" });
  });
});

describe("debouncedSaver", () => {
  it("writes once for a burst of saves", async () => {
    vi.useFakeTimers();
    const repository = createStateRepository(memoryStore());
    const save = vi.spyOn(repository, "save");
    const saver = debouncedSaver(repository, 300);

    saver.save(emptyState());
    saver.save(emptyState());
    saver.save(emptyState());
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("flushes immediately when asked", async () => {
    vi.useFakeTimers();
    const repository = createStateRepository(memoryStore());
    const save = vi.spyOn(repository, "save");
    const saver = debouncedSaver(repository, 300);

    saver.save(emptyState());
    expect(await saver.flush()).toEqual({ ok: true, value: undefined });
    expect(save).toHaveBeenCalledTimes(1);

    // The pending timer must not fire a second write.
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does nothing when there is nothing pending", async () => {
    const repository = createStateRepository(memoryStore());
    const save = vi.spyOn(repository, "save");
    expect(await debouncedSaver(repository, 300).flush()).toEqual({ ok: true, value: undefined });
    expect(save).not.toHaveBeenCalled();
  });
});
