import { emptyState, type TopicId } from "@pna/core";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "./store.js";
import { T0 } from "./testing/harness.js";

const topic = (id: string) => ({
  id: id as TopicId,
  parentId: null,
  title: id,
  brief: "",
  focusAreas: [],
  excludes: [],
  language: "ru",
  level: "intermediate" as const,
  createdAt: T0,
  updatedAt: T0,
});

describe("createStore", () => {
  it("exposes the current state", () => {
    const store = createStore(emptyState());
    expect(store.getState()).toEqual(emptyState());
  });

  it("applies the reducer and returns the next state", () => {
    const store = createStore(emptyState());
    const next = store.dispatch({ type: "topics/upsert", topic: topic("a") });
    expect(Object.keys(next.topics)).toEqual(["a"]);
    expect(store.getState()).toBe(next);
  });

  it("notifies subscribers on change", () => {
    const store = createStore(emptyState());
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "topics/upsert", topic: topic("a") });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toBe(store.getState());
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStore(emptyState());
    const listener = vi.fn();
    store.subscribe(listener)();

    store.dispatch({ type: "topics/upsert", topic: topic("a") });
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify when the reducer returns the same state", () => {
    const state = emptyState();
    const store = createStore(state);
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "state/replace", state });
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps notifying the other listeners when one throws", () => {
    const onError = vi.fn();
    const store = createStore(emptyState(), onError);
    const good = vi.fn();

    store.subscribe(() => {
      throw new Error("сломался");
    });
    store.subscribe(good);

    store.dispatch({ type: "topics/upsert", topic: topic("a") });
    expect(good).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("lets a listener unsubscribe during its own notification", () => {
    const store = createStore(emptyState());
    const seen: number[] = [];
    const off = store.subscribe(() => {
      seen.push(1);
      off();
    });
    store.subscribe(() => seen.push(2));

    store.dispatch({ type: "topics/upsert", topic: topic("a") });
    store.dispatch({ type: "topics/upsert", topic: topic("b") });
    expect(seen).toEqual([1, 2, 2]);
  });
});
