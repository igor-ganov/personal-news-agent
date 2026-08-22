import { css, html, LitElement, type PropertyValues } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { getDiagramRenderer } from "../diagrams/renderer.js";
import { baseCss } from "../styles/tokens.js";

let counter = 0;

/**
 * One Mermaid diagram.
 *
 * Rendering happens through the injected renderer; if none is registered, or
 * the model produced source Mermaid cannot parse, the source is shown instead
 * of an error — a broken diagram must not take the lecture down with it.
 */
export class UiDiagram extends LitElement {
  static override properties = {
    source: { type: String },
    caption: { type: String },
    heading: { type: String },
    _svg: { state: true },
    _failed: { state: true },
  };

  declare source: string;
  declare caption: string;
  declare heading: string;
  private declare _svg: string;
  private declare _failed: boolean;
  private readonly domId = `pna-diagram-${(counter += 1)}`;

  constructor() {
    super();
    this.source = "";
    this.caption = "";
    this.heading = "";
    this._svg = "";
    this._failed = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
        margin: 0 0 1em;
      }

      figure {
        margin: 0;
        padding: var(--pna-gap);
        background: var(--pna-surface);
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius);
      }

      h4 {
        margin: 0 0 var(--pna-gap-sm);
        font-size: 0.95rem;
      }

      .canvas {
        overflow-x: auto;
      }

      .canvas svg {
        max-width: 100%;
        height: auto;
      }

      pre {
        margin: 0;
        padding: var(--pna-gap-sm);
        background: var(--pna-surface-2);
        border-radius: var(--pna-radius-sm);
        overflow-x: auto;
        font-family: var(--pna-mono);
        font-size: 0.82rem;
      }

      figcaption {
        margin-top: var(--pna-gap-sm);
        font-size: 0.82rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  override updated(changed: PropertyValues<this>): void {
    if (changed.has("source")) void this.draw();
  }

  private async draw(): Promise<void> {
    const render = getDiagramRenderer();
    if (!render || this.source.trim().length === 0) {
      this._svg = "";
      this._failed = false;
      return;
    }
    try {
      this._svg = await render(this.domId, this.source);
      this._failed = false;
    } catch {
      this._svg = "";
      this._failed = true;
    }
  }

  override render() {
    return html`
      <figure>
        ${this.heading ? html`<h4>${this.heading}</h4>` : null}
        ${this._svg
          ? html`<div class="canvas">${unsafeSVG(this._svg)}</div>`
          : html`<pre>${this.source}</pre>`}
        ${this.caption ? html`<figcaption>${this.caption}</figcaption>` : null}
        ${this._failed
          ? html`<figcaption>Схему не удалось отрисовать — показан исходник.</figcaption>`
          : null}
      </figure>
    `;
  }
}

customElements.define("ui-diagram", UiDiagram);

declare global {
  interface HTMLElementTagNameMap {
    "ui-diagram": UiDiagram;
  }
}
