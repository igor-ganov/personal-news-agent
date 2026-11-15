import { css, html, LitElement } from "lit";
import { drawnCss, drawnFrame, nextSeed } from "../sketch/drawn.js";
import { baseCss } from "../styles/tokens.js";

/** A surface with a title row and a body. The whole content area is one slot. */
export class UiCard extends LitElement {
  static override properties = {
    heading: { type: String },
    subtitle: { type: String },
    flat: { type: Boolean },
  };

  declare heading: string;
  declare subtitle: string;
  declare flat: boolean;

  private readonly seed = nextSeed();

  constructor() {
    super();
    this.heading = "";
    this.subtitle = "";
    this.flat = false;
  }

  static override styles = [
    baseCss,
    drawnCss,
    css`
      :host {
        display: block;
      }

      .card {
        position: relative;
        padding: 14px 16px;
      }

      .card > .frame {
        color: var(--pna-text-dim);
      }

      .card.flat {
        padding: 0;
      }

      header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--pna-gap-sm);
        margin-bottom: var(--pna-gap-sm);
      }

      h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
      }

      .subtitle {
        margin: 2px 0 0;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  override render() {
    const hasHeader = this.heading.length > 0 || this.subtitle.length > 0;
    return html`
      <section class="card ${this.flat ? "flat" : ""}" part="card">
        ${hasHeader
          ? html`
              <header>
                <div class="grow">
                  ${this.heading ? html`<h2>${this.heading}</h2>` : null}
                  ${this.subtitle ? html`<p class="subtitle">${this.subtitle}</p>` : null}
                </div>
                <slot name="actions"></slot>
              </header>
            `
          : null}
        <slot></slot>
        ${this.flat ? null : drawnFrame(this.seed)}
      </section>
    `;
  }
}

customElements.define("ui-card", UiCard);

declare global {
  interface HTMLElementTagNameMap {
    "ui-card": UiCard;
  }
}
