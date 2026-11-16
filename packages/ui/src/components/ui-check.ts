import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { drawnCss, drawnFrame, nextSeed } from "../sketch/drawn.js";
import { drawnIcon, iconCss } from "../sketch/icons.js";
import { baseCss } from "../styles/tokens.js";

/**
 * A checkbox drawn by hand: a pencil box and a tick. The native input stays in
 * place, transparent over the whole row, so focus, keyboard and screen readers
 * get the real control while the eye gets the drawing.
 */
export class UiCheck extends LitElement {
  static override properties = {
    label: { type: String },
    checked: { type: Boolean, reflect: true },
  };

  declare label: string;
  declare checked: boolean;

  private readonly seed = nextSeed();

  constructor() {
    super();
    this.label = "";
    this.checked = false;
  }

  static override styles = [
    baseCss,
    drawnCss,
    iconCss,
    css`
      :host {
        display: block;
      }

      label {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--pna-gap);
        min-height: var(--pna-tap);
        cursor: pointer;
      }

      input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        opacity: 0;
        cursor: pointer;
      }

      .box {
        position: relative;
        display: grid;
        place-items: center;
        flex: none;
        width: 26px;
        height: 26px;
        color: var(--pna-text);
      }

      .box .icon {
        width: 20px;
        height: 20px;
      }

      input:focus-visible + .text + .box {
        outline: 2px solid var(--pna-text);
        outline-offset: 3px;
      }
    `,
  ];

  private change(event: Event): void {
    this.checked = (event.target as HTMLInputElement).checked;
    emit<boolean>(this, "check-change", this.checked);
  }

  override render() {
    return html`<label>
      <input type="checkbox" .checked=${this.checked} @change=${(e: Event) => this.change(e)} />
      <span class="text">${this.label}</span>
      <span class="box" aria-hidden="true">
        ${drawnFrame(this.seed, 200)} ${this.checked ? drawnIcon("tick") : null}
      </span>
    </label>`;
  }
}

customElements.define("ui-check", UiCheck);

declare global {
  interface HTMLElementTagNameMap {
    "ui-check": UiCheck;
  }
}
