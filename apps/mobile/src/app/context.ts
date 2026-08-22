import type { AppContext } from "@pna/app";
import { LitElement } from "lit";

let current: AppContext | null = null;

export const setAppContext = (context: AppContext): void => {
  current = context;
};

export const appContext = (): AppContext => {
  if (!current) throw new Error("Приложение ещё не инициализировано");
  return current;
};

/**
 * Base class for the screens.
 *
 * A screen re-renders when application state changes or when a long-running
 * task changes status — those are the only two sources of truth it reads.
 * Subscriptions are torn down on disconnect, so navigating away leaks nothing.
 */
export class ConnectedElement extends LitElement {
  protected readonly ctx: AppContext = appContext();
  private unsubscribes: Array<() => void> = [];

  override connectedCallback(): void {
    super.connectedCallback();
    const rerender = (): void => {
      this.requestUpdate();
    };
    this.unsubscribes = [this.ctx.store.subscribe(rerender), this.ctx.deps.tasks.subscribe(rerender)];
  }

  override disconnectedCallback(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    super.disconnectedCallback();
  }

  /** The error message of a task, or "" — screens pass this straight to components. */
  protected taskError(key: string): string {
    const state = this.ctx.deps.tasks.get(key);
    return state.status === "error" ? (state.error ?? "Что-то пошло не так") : "";
  }

  protected isBusy(key: string): boolean {
    return this.ctx.deps.tasks.isRunning(key);
  }
}
