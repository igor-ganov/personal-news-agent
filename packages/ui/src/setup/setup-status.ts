import { html } from "lit";

export interface SetupStatus {
  readonly busy: boolean;
  readonly error: string;
  /** Whether a proposal has been applied to the card. */
  readonly ready: boolean;
  /** What to say while the proposal is being asked for. */
  readonly working: string;
  /** What to say once it has been applied. */
  readonly done: string;
}

const statusText = ({ busy, error, ready, working, done }: SetupStatus): string =>
  busy ? working : error || (ready ? done : "");

/**
 * The line under a name field that says what the app made of the name. It is
 * always in the DOM, so a screen reader announces each change of its text.
 */
export const renderSetupStatus = (status: SetupStatus) =>
  html`<p class="setup-status" role="status">${statusText(status)}</p>`;
