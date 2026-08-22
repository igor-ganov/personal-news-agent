import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { baseCss } from "../styles/tokens.js";

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
        border: none;
        border-bottom: 2px solid transparent;
        background: none;
        color: var(--pna-text-dim);
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;
        white-space: nowrap;
      }

      button[aria-selected="true"] {
        color: var(--pna-text);
        border-bottom-color: var(--pna-accent);
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
