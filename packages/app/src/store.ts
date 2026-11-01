import { recordDeletions, reduce, systemClock, type Action, type AppState, type Clock } from "@pna/core";

export type Listener = (state: AppState) => void;

/**
 * The observable wrapper around the pure reducer.
 *
 * All the interesting behaviour lives in `reduce`; this only holds the current
 * value and tells listeners it changed. Listeners that throw are isolated so
 * one broken component cannot stop the others from updating.
 */
export interface Store {
  getState(): AppState;
  dispatch(action: Action): AppState;
  subscribe(listener: Listener): () => void;
}

/**
 * Actions that bring in a whole other copy of the state. What they drop was not
 * deleted by anyone here, so they leave no tombstones behind.
 */
const WHOLESALE: ReadonlySet<Action["type"]> = new Set(["state/replace", "state/merge"]);

export const createStore = (
  initial: AppState,
  onError: (error: unknown) => void = () => {},
  clock: Clock = systemClock,
): Store => {
  let state = initial;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,

    dispatch(action) {
      const reduced = reduce(state, action);
      const next = WHOLESALE.has(action.type) ? reduced : recordDeletions(state, reduced, clock.now());
      if (next === state) return state;
      state = next;
      for (const listener of [...listeners]) {
        try {
          listener(state);
        } catch (error) {
          onError(error);
        }
      }
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
