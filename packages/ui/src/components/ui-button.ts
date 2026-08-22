import { css, html, LitElement } from "lit";
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

  constructor() {
    super();
    this.variant = "secondary";
    this.size = "md";
    this.disabled = false;
    this.busy = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: inline-flex;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--pna-gap-sm);
        min-height: var(--pna-tap);
        padding: 0 16px;
        border-radius: var(--pna-radius-sm);
        border: 1px solid var(--pna-border);
        background: var(--pna-surface);
        color: var(--pna-text);
        font: inherit;
        font-weight: 500;
        cursor: pointer;
        width: 100%;
        transition: opacity 0.12s ease;
      }

      button:active {
        opacity: 0.7;
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
      }

      :host([size="sm"]) button,
      button.sm {
        min-height: 34px;
        padding: 0 10px;
        font-size: 0.85rem;
      }

      button.primary {
        background: var(--pna-accent);
        border-color: var(--pna-accent);
        color: var(--pna-accent-text);
      }

      button.ghost {
        background: transparent;
        border-color: transparent;
      }

      button.danger {
        background: transparent;
        border-color: var(--pna-danger);
        color: var(--pna-danger);
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
