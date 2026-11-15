import { latestOnly, proposeSetup, type AppContext, type SetupRequest } from "@pna/app";
import type { Setup } from "@pna/core";

/** What a card shows of the settings proposed for its name. */
export interface SetupView {
  readonly setup: Setup | undefined;
  readonly busy: boolean;
  readonly error: string;
}

export const NO_SETUP: SetupView = { setup: undefined, busy: false, error: "" };

export interface SetupAsker {
  readonly ask: (request: SetupRequest) => Promise<void>;
  /** The card closed or opened afresh: forget the proposal and drop any answer still on its way. */
  readonly reset: () => void;
}

/**
 * Asks for a card's settings and reports each stage through `show`. An answer
 * for a name the user has typed over since, or for a card that has closed, is
 * dropped rather than shown.
 */
export const setupAsker = (ctx: AppContext, show: (view: SetupView) => void): SetupAsker => {
  const latest = latestOnly(async (request: SetupRequest | undefined) =>
    request ? proposeSetup(ctx, request) : undefined,
  );
  return {
    async ask(request) {
      show({ setup: undefined, busy: true, error: "" });
      const answer = await latest(request);
      if (!answer) return;
      show(
        answer.ok
          ? { setup: answer.value, busy: false, error: "" }
          : { setup: undefined, busy: false, error: answer.error.message },
      );
    },
    reset() {
      void latest(undefined);
      show(NO_SETUP);
    },
  };
};
