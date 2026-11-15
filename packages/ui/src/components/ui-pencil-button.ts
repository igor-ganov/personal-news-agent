import { css, html, LitElement } from "lit";
import { pencilSvg } from "../sketch/pencil.js";
import { baseCss } from "../styles/tokens.js";

/**
 * The "add something" action: a handwritten label beside a real pencil. The
 * pencil is decoration; the accessible name is the slotted label.
 */
export class UiPencilButton extends LitElement {
  static override properties = {
    disabled: { type: Boolean, reflect: true },
  };

  declare disabled: boolean;

  constructor() {
    super();
    this.disabled = false;
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
        gap: 10px;
        min-height: var(--pna-tap);
        padding: 4px 2px;
        border: none;
        background: none;
        color: var(--pna-text);
        font-family: var(--pna-hand);
        font-weight: 600;
        font-size: 1.45rem;
        line-height: 1;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      button:focus-visible {
        outline: 2px solid var(--pna-text);
        outline-offset: 2px;
        border-radius: var(--pna-radius-sm);
      }

      button:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .pencil {
        width: 132px;
        height: 25px;
        overflow: visible;
        transform: rotate(-6deg);
        transition: transform 0.15s ease;
      }

      button:active .pencil {
        transform: rotate(-6deg) translate(-3px, 1px);
      }

      .pencil .cast {
        fill: rgba(50, 35, 10, 0.24);
      }

      .pencil .contact {
        fill: rgba(40, 28, 8, 0.38);
      }

      .pencil .stamp {
        font-family: var(--pna-font);
        font-size: 6px;
        letter-spacing: 1.2px;
        fill: rgba(28, 40, 22, 0.72);
      }

      @media (prefers-color-scheme: dark) {
        .pencil .cast {
          fill: rgba(0, 0, 0, 0.5);
        }

        .pencil .contact {
          fill: rgba(0, 0, 0, 0.6);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .pencil {
          transition: none;
        }
      }
    `,
  ];

  override render() {
    return html`
      <button type="button" ?disabled=${this.disabled} part="button">
        <span><slot></slot></span>
        ${pencilSvg}
      </button>
    `;
  }
}

customElements.define("ui-pencil-button", UiPencilButton);

declare global {
  interface HTMLElementTagNameMap {
    "ui-pencil-button": UiPencilButton;
  }
}
