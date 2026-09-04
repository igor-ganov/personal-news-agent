/**
 * Tracks the state of the long-running calls a screen triggers, keyed by a
 * string the UI chooses (`digest:topic_1:week`, `lesson:lesson_4`, …).
 *
 * The same key started twice returns the in-flight promise instead of firing a
 * second request — tapping "обновить" twice must not cost two generations.
 *
 * A task is not always this process's own promise. Generation that runs on the
 * server outlives the app, so the tracker also accepts state read back from
 * there: `adopt` is how a freshly started app learns that a lecture has been
 * writing itself for the last two minutes, and how a failure raised while the
 * phone was closed reaches the screen that asked for it.
 */
export type TaskStatus = "idle" | "running" | "error" | "done";

export interface TaskState {
  readonly status: TaskStatus;
  readonly error: string | null;
  /** Set when the work belongs to a server job rather than to this process. */
  readonly jobId: string | null;
  /**
   * A finished result the screen has not consumed yet — a program plan waiting
   * to be edited. Results that belong in the state document are applied and
   * never land here.
   */
  readonly result: unknown;
}

const IDLE: TaskState = { status: "idle", error: null, jobId: null, result: null };

const stateOf = (over: Partial<TaskState>): TaskState => ({ ...IDLE, ...over });

export interface TaskTracker {
  get(key: string): TaskState;
  isRunning(key: string): boolean;
  run<T>(key: string, work: () => Promise<T>): Promise<T>;
  /** Sets the state from outside — what a server job's status is folded in with. */
  adopt(key: string, state: Partial<TaskState>): void;
  reset(key: string): void;
  /** Every key the tracker knows something about. */
  keys(): string[];
  subscribe(listener: () => void): () => void;
}

const sameState = (a: TaskState, b: TaskState): boolean =>
  a.status === b.status && a.error === b.error && a.jobId === b.jobId && a.result === b.result;

export const createTaskTracker = (): TaskTracker => {
  const states = new Map<string, TaskState>();
  const inFlight = new Map<string, Promise<unknown>>();
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const set = (key: string, state: TaskState): void => {
    const current = states.get(key) ?? IDLE;
    if (sameState(current, state)) return;
    states.set(key, state);
    notify();
  };

  return {
    get: (key) => states.get(key) ?? IDLE,
    isRunning: (key) => (states.get(key) ?? IDLE).status === "running",
    keys: () => [...states.keys()],

    run<T>(key: string, work: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) return existing as Promise<T>;

      set(key, stateOf({ status: "running" }));
      const promise = work()
        .then((value) => {
          set(key, stateOf({ status: "done" }));
          return value;
        })
        .catch((error: unknown) => {
          set(
            key,
            stateOf({
              status: "error",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          throw error;
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, promise);
      return promise;
    },

    adopt(key, state) {
      set(key, stateOf(state));
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
  tracker.adopt(key, { status: "error", error: message });
};
