import type { AppContext } from "../container.js";

/**
 * Keeping the account's copy current without anyone pressing anything.
 *
 * Sync used to be a button, and a button is exactly what gets forgotten: a
 * topic typed on one device stayed there, and the second device started empty.
 * Here every change schedules a push, and coming back to the app pulls first,
 * so the account — not the phone — is where the data lives.
 */
export interface AutoSyncOptions {
  /** How long to wait after the last change before pushing. */
  readonly delayMs?: number;
  /** A floor between pushes, so a burst of edits costs one request. */
  readonly minIntervalMs?: number;
  readonly onError?: (message: string) => void;
}

export const startAutoSync = (ctx: AppContext, options: AutoSyncOptions = {}): (() => void) => {
  const delayMs = options.delayMs ?? 3_000;
  const minIntervalMs = options.minIntervalMs ?? 15_000;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;
  let running = false;
  let again = false;
  let stopped = false;

  const run = async (): Promise<void> => {
    const service = ctx.deps.account;
    if (stopped || !service || !service.current()) return;

    // A sync that starts while one is in flight would race the revision it is
    // about to bump; the second one runs after, once, no matter how many asked.
    if (running) {
      again = true;
      return;
    }

    running = true;
    lastRun = Date.now();
    try {
      const result = await service.sync();
      if (!result.ok) options.onError?.(result.error.message);
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        schedule(delayMs);
      }
    }
  };

  function schedule(waitMs: number): void {
    if (stopped || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, waitMs);
  }

  const onChange = (): void => {
    const since = Date.now() - lastRun;
    schedule(since >= minIntervalMs ? delayMs : Math.max(delayMs, minIntervalMs - since));
  };

  const unsubscribe = ctx.store.subscribe(onChange);
  void run();

  return () => {
    stopped = true;
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
  };
};

/**
 * Pulls and pushes now — what returning to the app does, and what the first
 * screen waits for.
 *
 * It reports the outcome instead of swallowing it: an app that shows an empty
 * list because the account could not be reached looks exactly like an app that
 * lost the data, and that is the one impression worth spending a banner on.
 */
export const syncNow = async (ctx: AppContext): Promise<"offline" | "synced" | string> => {
  const service = ctx.deps.account;
  if (!service?.current()) return "offline";

  const result = await service.sync();
  return result.ok ? "synced" : result.error.message;
};
