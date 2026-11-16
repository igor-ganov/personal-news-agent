import { css, html, LitElement, type PropertyValues } from "lit";
import { formatElapsed, isoDuration } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";

const TICK_MS = 1000;

/**
 * A long task, named: what is happening and for how long — never an anonymous
 * spinner. Generation can take minutes, and a timer that keeps moving is what
 * tells the user the app has not frozen.
 *
 * Only the activity sits in the live region. The timer is outside it, readable
 * on demand, so a screen reader announces the task once rather than every
 * second.
 */
export class UiTaskStatus extends LitElement {
  static override properties = {
    label: { type: String },
    since: { type: String },
    hint: { type: String, reflect: true },
    steps: { type: Array },
    _elapsed: { state: true },
  };

  declare label: string;
  /** When the task started (ISO instant); empty hides the timer. */
  declare since: string;
  declare hint: string;
  /** What the work is doing right now, current step first; empty shows none. */
  declare steps: readonly string[];
  /** The clock, replaceable so a test can freeze it. */
  now: () => number = () => Date.now();
  private declare _elapsed: number;
  private timer: ReturnType<typeof setInterval> | undefined = undefined;

  constructor() {
    super();
    this.label = "";
    this.since = "";
    this.hint = "";
    this.steps = [];
    this._elapsed = 0;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--pna-gap-sm);
        /* A note in the margin, not a card: a pencil rule down its left side. */
        padding: var(--pna-gap-sm) 0 var(--pna-gap-sm) var(--pna-gap);
        margin-bottom: var(--pna-gap);
        border-left: 2px solid var(--pna-line);
      }

      .spinner {
        inline-size: 14px;
        block-size: 14px;
        border: 2px solid var(--pna-accent);
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.9s linear infinite;
      }

      time {
        font-family: var(--pna-mono);
        font-variant-numeric: tabular-nums;
        color: var(--pna-text-dim);
      }

      [hidden] {
        display: none;
      }

      .steps {
        flex-basis: 100%;
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: 0.9rem;
      }

      .steps li + li {
        color: var(--pna-text-dim);
        font-size: 0.85rem;
      }

      .steps li {
        overflow-wrap: anywhere;
      }

      /* Read out with the label; on screen the list below shows it. */
      .sr-step {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      .hint {
        flex-basis: 100%;
        margin: 0;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .spinner {
          animation: none;
          border-right-color: var(--pna-accent);
          opacity: 0.6;
        }
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.timer);
    this.timer = undefined;
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("since")) this.tick();
  }

  private tick(): void {
    const start = Date.parse(this.since);
    this._elapsed = Number.isNaN(start) ? 0 : this.now() - start;
  }

  /** The current step, read out with the label but shown only in the list. */
  private announced(step: string | undefined) {
    return step ? html`<span class="sr-step">. ${step}</span>` : null;
  }

  override render() {
    // Every step is on screen in the list, hidden from assistive tech, which
    // hears the current one with the label instead.
    const [current] = this.steps;
    return html`
      <span class="spinner" aria-hidden="true"></span>
      <span role="status">${this.label}…${this.announced(current)}</span>
      <time ?hidden=${this.since.length === 0} datetime=${isoDuration(this._elapsed)}>${formatElapsed(this._elapsed)}</time>
      <ul class="steps" aria-hidden="true" ?hidden=${!current}>
        ${this.steps.map((step) => html`<li>${step}</li>`)}
      </ul>
      <p class="hint" ?hidden=${this.hint.length === 0}>${this.hint}</p>
    `;
  }
}

customElements.define("ui-task-status", UiTaskStatus);

declare global {
  interface HTMLElementTagNameMap {
    "ui-task-status": UiTaskStatus;
  }
}
