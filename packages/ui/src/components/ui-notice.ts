import { css, html, LitElement } from "lit";
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

  constructor() {
    super();
    this.tone = "info";
    this.message = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .notice {
        padding: var(--pna-gap);
        border-radius: var(--pna-radius-sm);
        border: 1px solid var(--pna-border);
        background: var(--pna-surface);
        font-size: 0.9rem;
      }

      .error {
        border-color: var(--pna-danger);
        color: var(--pna-danger);
      }

      .empty {
        border-style: dashed;
        color: var(--pna-text-dim);
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
