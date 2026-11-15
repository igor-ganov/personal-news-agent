import { css, html, LitElement } from "lit";
import { drawnCss, drawnFrame, nextSeed } from "../sketch/drawn.js";
import { baseCss } from "../styles/tokens.js";

export type NoticeTone = "info" | "error" | "empty";

/** Inline message: an error, a hint, or an empty-state explanation. */
export class UiNotice extends LitElement {
  static override properties = {
    tone: { type: String },
    message: { type: String },
  };

  declare tone: NoticeTone;
  declare message: string;

  private readonly seed = nextSeed();

  constructor() {
    super();
    this.tone = "info";
    this.message = "";
  }

  static override styles = [
    baseCss,
    drawnCss,
    css`
      :host {
        display: block;
      }

      .notice {
        position: relative;
        padding: var(--pna-gap);
        font-size: 0.95rem;
      }

      .info {
        color: var(--pna-text-dim);
        padding-inline: 0;
      }

      .error {
        color: var(--pna-danger);
      }

      .empty {
        color: var(--pna-text-dim);
        font-style: italic;
        text-align: center;
      }

      .actions {
        margin-top: var(--pna-gap-sm);
        display: flex;
        justify-content: center;
        gap: var(--pna-gap-sm);
      }
    `,
  ];

  override render() {
    return html`
      <div class="notice ${this.tone}" role=${this.tone === "error" ? "alert" : "status"}>
        ${this.message ? html`<div>${this.message}</div>` : null}
        <slot></slot>
        <div class="actions"><slot name="actions"></slot></div>
        ${this.tone === "error" ? drawnFrame(this.seed, 36) : null}
      </div>
    `;
  }
}

customElements.define("ui-notice", UiNotice);

declare global {
  interface HTMLElementTagNameMap {
    "ui-notice": UiNotice;
  }
}
