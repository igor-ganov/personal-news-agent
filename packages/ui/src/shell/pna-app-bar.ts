import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { drawnCss, drawnRule, nextSeed } from "../sketch/drawn.js";
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

  private readonly seed = nextSeed();

  constructor() {
    super();
    this.heading = "";
    this.subtitle = "";
    this.canGoBack = false;
  }

  static override styles = [
    baseCss,
    drawnCss,
    css`
      :host {
        display: block;
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--pna-bg);
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
        display: grid;
        place-items: center;
        width: var(--pna-tap);
        height: var(--pna-tap);
        margin-left: -10px;
        border: none;
        background: none;
        color: var(--pna-text);
        cursor: pointer;
      }

      .back svg {
        width: 24px;
        height: 24px;
      }

      .back path {
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      @media (prefers-color-scheme: dark) {
        .back {
          color: var(--pna-accent);
        }
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
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M15.5 5.2 C 12.6 8.1 10.4 10.3 7.6 12.2 C 10.5 14 12.8 16.1 15.2 19"></path>
              </svg>
            </button>`
          : null}
        <div class="grow">
          <h1 class="truncate">${this.heading}</h1>
          ${this.subtitle ? html`<div class="subtitle truncate">${this.subtitle}</div>` : null}
        </div>
        <slot name="actions"></slot>
      </div>
      <slot name="tabs"></slot>
      ${drawnRule(this.seed)}
    `;
  }
}

customElements.define("pna-app-bar", PnaAppBar);

declare global {
  interface HTMLElementTagNameMap {
    "pna-app-bar": PnaAppBar;
  }
}
