import { describe, expect, it, vi } from "vitest";
import { createTaskTracker, failTask, type TaskState } from "./tasks.js";

/** The half of the state these tests are about: status and message. */
const summary = (state: TaskState) => ({ status: state.status, error: state.error });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("createTaskTracker", () => {
  it("starts idle", () => {
    expect(summary(createTaskTracker().get("x"))).toEqual({ status: "idle", error: null });
  });

  it("tracks a task from running to done", async () => {
    const tracker = createTaskTracker();
    const gate = deferred<string>();

    const running = tracker.run("x", () => gate.promise);
    expect(summary(tracker.get("x"))).toEqual({ status: "running", error: null });
    expect(tracker.isRunning("x")).toBe(true);

    gate.resolve("готово");
    expect(await running).toBe("готово");
    expect(summary(tracker.get("x"))).toEqual({ status: "done", error: null });
  });

  it("records the failure message and rethrows", async () => {
    const tracker = createTaskTracker();
    await expect(
      tracker.run("x", async () => {
        throw new Error("нет сети");
      }),
    ).rejects.toThrow("нет сети");
    expect(summary(tracker.get("x"))).toEqual({ status: "error", error: "нет сети" });
  });

  it("shares one in-flight promise instead of starting the work twice", async () => {
    const tracker = createTaskTracker();
    const work = vi.fn(async () => "раз");

    const [a, b] = await Promise.all([tracker.run("x", work), tracker.run("x", work)]);
    expect(work).toHaveBeenCalledTimes(1);
    expect([a, b]).toEqual(["раз", "раз"]);
  });

  it("allows a fresh run once the previous one settled", async () => {
    const tracker = createTaskTracker();
    const work = vi.fn(async () => "ok");
    await tracker.run("x", work);
    await tracker.run("x", work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("keeps different keys independent", async () => {
    const tracker = createTaskTracker();
    await tracker.run("a", async () => "ok");
    await expect(tracker.run("b", async () => Promise.reject(new Error("bad")))).rejects.toThrow();
    expect(tracker.get("a").status).toBe("done");
    expect(tracker.get("b").status).toBe("error");
  });

  it("notifies subscribers on every transition", async () => {
    const tracker = createTaskTracker();
    const listener = vi.fn();
    tracker.subscribe(listener);

    await tracker.run("x", async () => "ok");
    expect(listener).toHaveBeenCalledTimes(2); // running, then done
  });

  it("resets a key back to idle", async () => {
    const tracker = createTaskTracker();
    await tracker.run("x", async () => "ok");
    tracker.reset("x");
    expect(summary(tracker.get("x"))).toEqual({ status: "idle", error: null });
  });
});

describe("failTask", () => {
  it("marks a key failed without an exception escaping", async () => {
    const tracker = createTaskTracker();
    failTask(tracker, "x", "тема не найдена");
    await Promise.resolve();
    await Promise.resolve();
    expect(summary(tracker.get("x"))).toEqual({ status: "error", error: "тема не найдена" });
  });
});
