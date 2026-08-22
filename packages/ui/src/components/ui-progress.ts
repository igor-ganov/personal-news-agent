import { css, html, LitElement } from "lit";
import { baseCss } from "../styles/tokens.js";

/** A completion bar, 0..1. */
export class UiProgress extends LitElement {
  static override properties = {
    value: { type: Number },
    caption: { type: String },
  };

  declare value: number;
  declare caption: string;

  constructor() {
    super();
    this.value = 0;
    this.caption = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .track {
        height: 6px;
        border-radius: 999px;
        background: var(--pna-surface-2);
        overflow: hidden;
      }

      .fill {
        height: 100%;
        background: var(--pna-accent);
        transition: width 0.2s ease;
      }

      .caption {
        margin-top: 4px;
        font-size: 0.8rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  override render() {
    const ratio = Math.min(1, Math.max(0, Number.isFinite(this.value) ? this.value : 0));
    return html`
      <div class="progress">
        <div
          class="track"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${Math.round(ratio * 100)}
        >
          <div class="fill" style="width: ${ratio * 100}%"></div>
        </div>
        ${this.caption ? html`<div class="caption">${this.caption}</div>` : null}
      </div>
    `;
  }
}

customElements.define("ui-progress", UiProgress);

declare global {
  interface HTMLElementTagNameMap {
    "ui-progress": UiProgress;
  }
}
