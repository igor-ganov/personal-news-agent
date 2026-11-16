import { css, html, LitElement } from "lit";
import { drawnCss, drawnOval, nextSeed } from "../sketch/drawn.js";
import { drawnIcon, iconCss } from "../sketch/icons.js";
import { baseCss } from "../styles/tokens.js";

export type ChipTone = "neutral" | "accent" | "ok" | "warn" | "danger";

/**
 * A small status word. With `selectable` it becomes a toggle: one choice of
 * several is circled, as a pen circles an answer; with `multiple` as well,
 * each chosen word gets a tick instead, so "any of these" never looks like
 * "one of these".
 */
export class UiChip extends LitElement {
  static override properties = {
    tone: { type: String },
    selectable: { type: Boolean },
    selected: { type: Boolean, reflect: true },
    multiple: { type: Boolean },
  };

  declare tone: ChipTone;
  declare selectable: boolean;
  declare selected: boolean;
  declare multiple: boolean;

  private readonly seed = nextSeed();

  constructor() {
    super();
    this.tone = "neutral";
    this.selectable = false;
    this.selected = false;
    this.multiple = false;
  }

  static override styles = [
    baseCss,
    drawnCss,
    iconCss,
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
        padding: 0 14px;
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

      /* The loop stays inside the chip, so two circled neighbours never touch. */
      .oval {
        inset: 4px 2px;
        width: calc(100% - 4px);
        height: calc(100% - 8px);
      }

      .tick {
        display: inline-grid;
        width: 18px;
        height: 18px;
      }

      .tick .icon {
        width: 18px;
        height: 18px;
      }

      button.multi {
        padding-inline: 6px 12px;
      }
    `,
  ];

  override render() {
    return this.selectable
      ? html`<button
          class="chip ${this.tone} ${this.multiple ? "multi" : ""}"
          part="chip"
          aria-pressed=${this.selected ? "true" : "false"}
        >
          ${this.multiple
            ? html`<span class="tick" aria-hidden="true">${this.selected ? drawnIcon("tick") : null}</span>`
            : null}
          <slot></slot>
          ${this.selected && !this.multiple ? drawnOval(this.seed) : null}
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
