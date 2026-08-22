/**
 * Tracks the state of the long-running calls a screen triggers, keyed by a
 * string the UI chooses (`digest:topic_1:week`, `lesson:lesson_4`, …).
 *
 * The same key started twice returns the in-flight promise instead of firing a
 * second request — tapping "обновить" twice must not cost two generations.
 */
export type TaskStatus = "idle" | "running" | "error" | "done";

export interface TaskState {
  readonly status: TaskStatus;
  readonly error: string | null;
}

const IDLE: TaskState = { status: "idle", error: null };

export interface TaskTracker {
  get(key: string): TaskState;
  isRunning(key: string): boolean;
  run<T>(key: string, work: () => Promise<T>): Promise<T>;
  reset(key: string): void;
  subscribe(listener: () => void): () => void;
}

export const createTaskTracker = (): TaskTracker => {
  const states = new Map<string, TaskState>();
  const inFlight = new Map<string, Promise<unknown>>();
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const set = (key: string, state: TaskState): void => {
    states.set(key, state);
    notify();
  };

  return {
    get: (key) => states.get(key) ?? IDLE,
    isRunning: (key) => (states.get(key) ?? IDLE).status === "running",

    run<T>(key: string, work: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) return existing as Promise<T>;

      set(key, { status: "running", error: null });
      const promise = work()
        .then((value) => {
          set(key, { status: "done", error: null });
          return value;
        })
        .catch((error: unknown) => {
          set(key, {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, promise);
      return promise;
    },

    reset(key) {
      states.delete(key);
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/** Marks a task failed from a domain-level failure that never threw. */
export const failTask = (tracker: TaskTracker, key: string, message: string): void => {
  void tracker.run(key, async () => {
    throw new Error(message);
  }).catch(() => {});
};
