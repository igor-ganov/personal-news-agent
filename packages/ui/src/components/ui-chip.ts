import { css, html, LitElement } from "lit";
import { drawnCss, drawnOval, nextSeed } from "../sketch/drawn.js";
import { baseCss } from "../styles/tokens.js";

export type ChipTone = "neutral" | "accent" | "ok" | "warn" | "danger";

/** A small status or tag pill. Also usable as a toggle when `selectable` is set. */
export class UiChip extends LitElement {
  static override properties = {
    tone: { type: String },
    selectable: { type: Boolean },
    selected: { type: Boolean, reflect: true },
  };

  declare tone: ChipTone;
  declare selectable: boolean;
  declare selected: boolean;

  private readonly seed = nextSeed();

  constructor() {
    super();
    this.tone = "neutral";
    this.selectable = false;
    this.selected = false;
  }

  static override styles = [
    baseCss,
    drawnCss,
    css`
      :host {
        display: inline-flex;
      }

      .chip {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px;
        border: none;
        background: none;
        color: var(--pna-text-dim);
        font-size: 0.8rem;
        line-height: 1.5;
        white-space: nowrap;
      }

      button.chip {
        min-height: var(--pna-tap);
        padding: 0 10px;
        font: inherit;
        font-size: 0.95rem;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      button.chip:focus-visible {
        outline: 2px solid var(--pna-text);
        outline-offset: 2px;
        border-radius: var(--pna-radius-sm);
      }

      .accent {
        color: var(--pna-accent);
      }
      .ok {
        color: var(--pna-ok);
      }
      .warn {
        color: var(--pna-warn);
      }
      .danger {
        color: var(--pna-danger);
      }

      :host([selected]) .chip {
        color: var(--pna-text);
        font-weight: 600;
      }

      .oval {
        inset: 3px -4px;
        width: calc(100% + 8px);
        height: calc(100% - 6px);
      }
    `,
  ];

  override render() {
    return this.selectable
      ? html`<button
          class="chip ${this.tone}"
          part="chip"
          aria-pressed=${this.selected ? "true" : "false"}
        >
          <slot></slot>
          ${this.selected ? drawnOval(this.seed) : null}
        </button>`
      : html`<span class="chip ${this.tone}" part="chip"><slot></slot></span>`;
  }
}

customElements.define("ui-chip", UiChip);

declare global {
  interface HTMLElementTagNameMap {
    "ui-chip": UiChip;
  }
}
