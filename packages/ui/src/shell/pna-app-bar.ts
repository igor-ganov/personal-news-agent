import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { baseCss } from "../styles/tokens.js";

/** The sticky top bar: optional back button, title, and a slot for actions. */
export class PnaAppBar extends LitElement {
  static override properties = {
    heading: { type: String },
    subtitle: { type: String },
    canGoBack: { type: Boolean },
  };

  declare heading: string;
  declare subtitle: string;
  declare canGoBack: boolean;

  constructor() {
    super();
    this.heading = "";
    this.subtitle = "";
    this.canGoBack = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--pna-bg);
        border-bottom: 1px solid var(--pna-border);
        padding-top: env(safe-area-inset-top);
      }

      .bar {
        display: flex;
        align-items: center;
        gap: var(--pna-gap-sm);
        min-height: 52px;
        padding: 6px var(--pna-gap);
      }

      .back {
        min-width: 36px;
        min-height: 36px;
        border: none;
        background: none;
        color: var(--pna-accent);
        font: inherit;
        font-size: 1.2rem;
        cursor: pointer;
      }

      h1 {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 600;
        line-height: 1.25;
      }

      .subtitle {
        font-size: 0.78rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  override render() {
    return html`
      <div class="bar">
        ${this.canGoBack
          ? html`<button class="back" aria-label="Назад" @click=${() => emit(this, "go-back", null)}>
              ‹
            </button>`
          : null}
        <div class="grow">
          <h1 class="truncate">${this.heading}</h1>
          ${this.subtitle ? html`<div class="subtitle truncate">${this.subtitle}</div>` : null}
        </div>
        <slot name="actions"></slot>
      </div>
      <slot name="tabs"></slot>
    `;
  }
}

customElements.define("pna-app-bar", PnaAppBar);

declare global {
  interface HTMLElementTagNameMap {
    "pna-app-bar": PnaAppBar;
  }
}
