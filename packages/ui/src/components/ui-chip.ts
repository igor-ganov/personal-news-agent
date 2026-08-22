import { css, html, LitElement } from "lit";
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

  constructor() {
    super();
    this.tone = "neutral";
    this.selectable = false;
    this.selected = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: inline-flex;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 999px;
        border: 1px solid var(--pna-border);
        background: var(--pna-surface-2);
        color: var(--pna-text-dim);
        font-size: 0.78rem;
        line-height: 1.6;
        white-space: nowrap;
      }

      button.chip {
        min-height: 32px;
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
      }

      .accent {
        color: var(--pna-accent);
        border-color: var(--pna-accent);
      }
      .ok {
        color: var(--pna-ok);
        border-color: var(--pna-ok);
      }
      .warn {
        color: var(--pna-warn);
        border-color: var(--pna-warn);
      }
      .danger {
        color: var(--pna-danger);
        border-color: var(--pna-danger);
      }

      :host([selected]) .chip {
        background: var(--pna-accent);
        border-color: var(--pna-accent);
        color: var(--pna-accent-text);
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
