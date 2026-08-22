import { css, html, LitElement } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { renderMarkdown } from "../markdown/render.js";
import { baseCss } from "../styles/tokens.js";

/**
 * Renders a Markdown lecture body.
 *
 * `unsafeHTML` is safe here specifically because `renderMarkdown` escapes its
 * input before producing any markup — the two belong together.
 */
export class UiMarkdown extends LitElement {
  static override properties = {
    source: { type: String },
  };

  declare source: string;

  constructor() {
    super();
    this.source = "";
  }

  static override styles = [
    baseCss,
    css`
      :host,
      .body {
        display: block;
        line-height: 1.6;
      }

      h1,
      h2,
      h3,
      h4 {
        line-height: 1.3;
        margin: 1.4em 0 0.5em;
      }

      h1 {
        font-size: 1.35rem;
      }
      h2 {
        font-size: 1.15rem;
      }
      h3 {
        font-size: 1rem;
      }

      :first-child {
        margin-top: 0;
      }

      p,
      ul,
      ol,
      blockquote {
        margin: 0 0 1em;
      }

      ul,
      ol {
        padding-left: 1.3em;
      }

      li {
        margin-bottom: 0.35em;
      }

      a {
        color: var(--pna-accent);
      }

      code {
        font-family: var(--pna-mono);
        font-size: 0.88em;
        background: var(--pna-surface-2);
        padding: 1px 5px;
        border-radius: 4px;
      }

      pre {
        margin: 0 0 1em;
        padding: var(--pna-gap);
        background: var(--pna-surface-2);
        border-radius: var(--pna-radius-sm);
        overflow-x: auto;
      }

      pre code {
        background: none;
        padding: 0;
      }

      blockquote {
        padding-left: var(--pna-gap);
        border-left: 3px solid var(--pna-border);
        color: var(--pna-text-dim);
      }

      hr {
        border: none;
        border-top: 1px solid var(--pna-border);
        margin: 1.5em 0;
      }
    `,
  ];

  override render() {
    return html`<div class="body">${unsafeHTML(renderMarkdown(this.source))}</div>`;
  }
}

customElements.define("ui-markdown", UiMarkdown);

declare global {
  interface HTMLElementTagNameMap {
    "ui-markdown": UiMarkdown;
  }
}
