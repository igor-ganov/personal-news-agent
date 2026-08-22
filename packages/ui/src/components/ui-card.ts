import { css, html, LitElement } from "lit";
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

  constructor() {
    super();
    this.heading = "";
    this.subtitle = "";
    this.flat = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .card {
        background: var(--pna-surface);
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius);
        padding: var(--pna-gap);
      }

      .card.flat {
        background: transparent;
        border-color: transparent;
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
