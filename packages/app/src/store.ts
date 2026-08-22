import { reduce, type Action, type AppState } from "@pna/core";

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

export const createStore = (
  initial: AppState,
  onError: (error: unknown) => void = () => {},
): Store => {
  let state = initial;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,

    dispatch(action) {
      const next = reduce(state, action);
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
