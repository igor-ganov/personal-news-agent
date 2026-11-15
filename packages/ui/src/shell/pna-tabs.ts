import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { sketchLine } from "../sketch/path.js";
import { seedOf } from "../sketch/seed.js";
import { baseCss } from "../styles/tokens.js";

/** The pencil stroke under the selected tab, its own for every tab. */
const markFor = (id: string): string =>
  [sketchLine({ seed: seedOf(id), wobble: 1.6 })(2, 4, 78, 3.4), sketchLine({ seed: seedOf(id) + 1, wobble: 1.2 })(6, 6.6, 72, 6.2)].join(" ");

export interface TabDef {
  readonly id: string;
  readonly label: string;
  readonly badge?: string;
}

/** The tab strip inside a topic: news, skills, sources, settings. */
export class PnaTabs extends LitElement {
  static override properties = {
    tabs: { type: Array },
    active: { type: String },
  };

  declare tabs: readonly TabDef[];
  declare active: string;

  constructor() {
    super();
    this.tabs = [];
    this.active = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      nav {
        display: flex;
        overflow-x: auto;
        scrollbar-width: none;
      }

      nav::-webkit-scrollbar {
        display: none;
      }

      button {
        flex: 1 0 auto;
        min-height: 42px;
        padding: 0 14px;
        position: relative;
        border: none;
        background: none;
        color: var(--pna-text-dim);
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;
        white-space: nowrap;
      }

      button[aria-selected="true"] {
        color: var(--pna-text);
        font-weight: 600;
      }

      .mark {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 3px;
        width: calc(100% - 16px);
        height: 10px;
        overflow: visible;
      }

      .mark path {
        fill: none;
        stroke: var(--pna-text);
        stroke-width: 2;
        stroke-linecap: round;
        opacity: 0.85;
        vector-effect: non-scaling-stroke;
      }

      .badge {
        margin-left: 5px;
        font-size: 0.75rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  override render() {
    return html`
      <nav role="tablist">
        ${this.tabs.map(
          (tab) => html`
            <button
              role="tab"
              aria-selected=${this.active === tab.id ? "true" : "false"}
              @click=${() => emit<string>(this, "tab-select", tab.id)}
            >
              ${tab.label}${tab.badge ? html`<span class="badge">${tab.badge}</span>` : null}
              ${this.active === tab.id
                ? html`<svg class="mark" aria-hidden="true" viewBox="0 0 80 10" preserveAspectRatio="none"><path d=${markFor(tab.id)}></path></svg>`
                : null}
            </button>
          `,
        )}
      </nav>
    `;
  }
}

customElements.define("pna-tabs", PnaTabs);

declare global {
  interface HTMLElementTagNameMap {
    "pna-tabs": PnaTabs;
  }
}
