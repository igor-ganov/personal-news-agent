import { css, html, LitElement, svg, type TemplateResult } from "lit";
import qrcode from "qrcode-generator";
import { baseCss } from "../styles/tokens.js";

const QUIET = 4;

/**
 * A QR code as inline SVG.
 *
 * Drawn rather than fetched: an image service would mean sending the link —
 * which is a single-use credential — to a third party. The SVG scales to
 * whatever the screen gives it, which is what a phone camera needs.
 */
export class UiQr extends LitElement {
  static override properties = {
    value: { type: String },
    label: { type: String },
  };

  declare value: string;
  declare label: string;

  constructor() {
    super();
    this.value = "";
    this.label = "QR-код";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      svg {
        display: block;
        width: 100%;
        max-width: 260px;
        height: auto;
        background: #fff;
        border-radius: var(--pna-radius-sm);
        padding: 8px;
        box-sizing: border-box;
      }
    `,
  ];

  override render() {
    if (!this.value) return html``;

    // Version 0 lets the library pick the smallest one the text fits into.
    const code = qrcode(0, "M");
    code.addData(this.value);
    code.make();

    const count = code.getModuleCount();
    const size = count + QUIET * 2;
    const cells: TemplateResult[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (code.isDark(row, col))
          cells.push(svg`<rect x=${col + QUIET} y=${row + QUIET} width="1" height="1" />`);
      }
    }

    return html`
      <svg
        viewBox="0 0 ${size} ${size}"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label=${this.label}
        shape-rendering="crispEdges"
      >
        <rect width=${size} height=${size} fill="#fff" />
        <g fill="#000">${cells}</g>
      </svg>
    `;
  }
}

customElements.define("ui-qr", UiQr);

declare global {
  interface HTMLElementTagNameMap {
    "ui-qr": UiQr;
  }
}
