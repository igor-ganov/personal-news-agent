import { css, html, LitElement } from "lit";
import { drawnCss, drawnFrame, drawnUnder, nextSeed } from "../sketch/drawn.js";
import { baseCss } from "../styles/tokens.js";

/**
 * The app's only button. How it is drawn says how much it matters: the main
 * action of a screen is boxed, a secondary one underlined, a quiet one is plain
 * text. Every size is a full 44px tap target, and `busy` shows progress
 * without changing the layout.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";

/** What goes under the label: an underline marks a tappable word that has no box. */
const MARK: Readonly<Record<Variant, (seed: number) => unknown>> = {
  primary: () => null,
  secondary: drawnUnder,
  ghost: () => null,
  danger: drawnUnder,
};

export class UiButton extends LitElement {
  static override properties = {
    variant: { type: String },
    size: { type: String },
    disabled: { type: Boolean, reflect: true },
    busy: { type: Boolean },
  };

  declare variant: Variant;
  declare size: "md" | "sm";
  declare disabled: boolean;
  declare busy: boolean;

  private readonly seed = nextSeed();

  constructor() {
    super();
    this.variant = "secondary";
    this.size = "md";
    this.disabled = false;
    this.busy = false;
  }

  static override styles = [
    baseCss,
    drawnCss,
    css`
      :host {
        display: inline-flex;
      }

      button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--pna-gap-sm);
        min-height: var(--pna-tap);
        padding: 0 16px;
        border: none;
        background: none;
        color: var(--pna-text);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
        width: 100%;
        transition: transform 0.08s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .caption {
        position: relative;
      }

      .under {
        color: var(--pna-text-dim);
      }

      button:active {
        transform: translateY(1px);
      }

      button:focus-visible {
        outline: 2px solid var(--pna-text);
        outline-offset: 3px;
        border-radius: var(--pna-radius-sm);
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
      }

      :host([size="sm"]) button,
      button.sm {
        padding: 0 10px;
        font-size: 0.9rem;
      }

      button.secondary,
      button.ghost,
      button.danger {
        padding-inline: 4px;
      }

      button.primary {
        font-weight: 650;
        padding-inline: 20px;
      }

      button.primary .frame path {
        stroke-width: 2;
      }

      button.ghost {
        font-weight: 400;
        color: var(--pna-text-dim);
      }

      button.danger,
      button.danger .under {
        color: var(--pna-danger);
      }

      @media (prefers-reduced-motion: reduce) {
        button {
          transition: none;
        }
      }

      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .spinner {
          animation-duration: 2s;
        }
      }
    `,
  ];

  override render() {
    return html`
      <button
        class="${this.variant} ${this.size}"
        ?disabled=${this.disabled || this.busy}
        part="button"
      >
        ${this.busy ? html`<span class="spinner" aria-hidden="true"></span>` : null}
        <span class="caption"><slot></slot>${MARK[this.variant](this.seed)}</span>
        ${this.variant === "primary" ? drawnFrame(this.seed, 36) : null}
      </button>
    `;
  }
}

customElements.define("ui-button", UiButton);

declare global {
  interface HTMLElementTagNameMap {
    "ui-button": UiButton;
  }
}
