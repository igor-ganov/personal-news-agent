import { css, html, LitElement } from "lit";
import { drawnIcon, iconCss, type IconName } from "../sketch/icons.js";
import { baseCss } from "../styles/tokens.js";

/**
 * A drawn icon that acts: a full tap target round a small mark. The icon says
 * nothing to a screen reader, so the name is required and goes on the button
 * itself, where assistive technology looks for it.
 */
export class UiIconButton extends LitElement {
  static override properties = {
    icon: { type: String },
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  declare icon: IconName;
  declare label: string;
  declare disabled: boolean;

  constructor() {
    super();
    this.icon = "gear";
    this.label = "";
    this.disabled = false;
  }

  static override styles = [
    baseCss,
    iconCss,
    css`
      :host {
        display: inline-flex;
      }

      button {
        display: grid;
        place-items: center;
        width: var(--pna-tap);
        height: var(--pna-tap);
        padding: 0;
        border: none;
        background: none;
        color: var(--pna-text);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      button:focus-visible {
        outline: 2px solid var(--pna-text);
        outline-offset: -2px;
        border-radius: var(--pna-radius-sm);
      }

      button:disabled {
        opacity: 0.4;
        cursor: default;
      }

      button:active .icon {
        transform: translateY(1px);
      }
    `,
  ];

  override render() {
    return html`<button type="button" aria-label=${this.label} title=${this.label} ?disabled=${this.disabled} part="button">
      ${drawnIcon(this.icon)}
    </button>`;
  }
}

customElements.define("ui-icon-button", UiIconButton);

declare global {
  interface HTMLElementTagNameMap {
    "ui-icon-button": UiIconButton;
  }
}
