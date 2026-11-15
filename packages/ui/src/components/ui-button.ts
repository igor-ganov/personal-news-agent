import { css, html, LitElement } from "lit";
import { drawnCss, drawnFrame, nextSeed } from "../sketch/drawn.js";
import { baseCss } from "../styles/tokens.js";

/**
 * The app's only button. Tap targets are at least 44px so it stays usable on a
 * phone, and `busy` shows progress without changing the layout.
 */
export class UiButton extends LitElement {
  static override properties = {
    variant: { type: String },
    size: { type: String },
    disabled: { type: Boolean, reflect: true },
    busy: { type: Boolean },
  };

  declare variant: "primary" | "secondary" | "ghost" | "danger";
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

      button .frame {
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
        min-height: 36px;
        padding: 0 12px;
        font-size: 0.9rem;
      }

      button.primary {
        font-weight: 650;
      }

      button.primary .frame {
        color: var(--pna-text);
      }

      button.primary .frame path {
        stroke-width: 2;
      }

      button.ghost {
        color: var(--pna-text-dim);
      }

      button.danger {
        color: var(--pna-danger);
      }

      button.danger .frame {
        color: var(--pna-danger);
      }

      @media (prefers-color-scheme: dark) {
        button.primary,
        button.primary .frame {
          color: var(--pna-accent);
        }
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
        <slot></slot>
        ${this.variant === "ghost" ? null : drawnFrame(this.seed, 36)}
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
