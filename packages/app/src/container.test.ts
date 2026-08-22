import { createMockProvider } from "@pna/agent";
import { emptyState, fixedClock, sequentialIds, type TopicId } from "@pna/core";
import { createSecretStore, createStateRepository, memoryStore, STATE_KEY } from "@pna/storage";
import { describe, expect, it, vi } from "vitest";
import { bootstrap } from "./container.js";
import { T0 } from "./testing/harness.js";
import { addTopic } from "./usecases/topics.js";
import { hasApiKey, saveApiKey } from "./usecases/settings.js";

const options = () => ({
  provider: createMockProvider(),
  clock: fixedClock(T0),
  ids: sequentialIds(),
});

describe("bootstrap", () => {
  it("starts empty on a first run", async () => {
    const { context, loadWarning } = await bootstrap(options());
    expect(context.store.getState()).toEqual(emptyState());
    expect(loadWarning).toBeNull();
  });

  it("restores a saved state", async () => {
    const store = memoryStore();
    const repository = createStateRepository(store);
    const saved = { ...emptyState(), settings: { ...emptyState().settings, sourceRefreshDays: 3 } };
    await repository.save(saved);

    const { context } = await bootstrap({ ...options(), repository });
    expect(context.store.getState().settings.sourceRefreshDays).toBe(3);
  });

  it("starts empty and explains itself when the saved data is corrupt", async () => {
    const repository = createStateRepository(memoryStore({ [STATE_KEY]: "не json" }));
    const { context, loadWarning } = await bootstrap({ ...options(), repository });

    expect(context.store.getState()).toEqual(emptyState());
    expect(loadWarning).toContain("JSON");
  });

  it("persists changes after the debounce window", async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const repository = createStateRepository(store);
    const { context } = await bootstrap({ ...options(), repository, saveDelayMs: 100 });

    addTopic(context, { parentId: null, title: "ИИ" });
    expect(await store.get(STATE_KEY)).toBeNull();

    await vi.advanceTimersByTimeAsync(100);
    const raw = await store.get(STATE_KEY);
    expect(raw).toContain("ИИ");
    vi.useRealTimers();
  });

  it("flush writes immediately", async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const { context, flush } = await bootstrap({
      ...options(),
      repository: createStateRepository(store),
      saveDelayMs: 10_000,
    });

    addTopic(context, { parentId: null, title: "ИИ" });
    await flush();
    expect(await store.get(STATE_KEY)).toContain("ИИ");
    vi.useRealTimers();
  });

  it("keeps the api key out of the persisted state", async () => {
    const store = memoryStore();
    const { context, flush } = await bootstrap({
      ...options(),
      repository: createStateRepository(store),
      secrets: createSecretStore(store),
      saveDelayMs: 1,
    });

    await saveApiKey(context, "sk-ant-secret");
    addTopic(context, { parentId: null, title: "ИИ" });
    await flush();

    expect(await hasApiKey(context)).toBe(true);
    expect(await store.get(STATE_KEY)).not.toContain("sk-ant-secret");
  });

  it("round-trips a topic through save and reload", async () => {
    const store = memoryStore();
    const repository = createStateRepository(store);

    const first = await bootstrap({ ...options(), repository, saveDelayMs: 1 });
    const created = addTopic(first.context, { parentId: null, title: "ИИ", brief: "практика" });
    if (!created.ok) throw new Error("expected ok");
    await first.flush();

    const second = await bootstrap({ ...options(), repository });
    expect(second.context.store.getState().topics[created.value.id as TopicId]).toMatchObject({
      title: "ИИ",
      brief: "практика",
    });
  });
});
