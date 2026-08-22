import type { TopicId, TopicNode } from "@pna/core";
import { css, html, LitElement, type TemplateResult } from "lit";
import { emit } from "../events.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-notice.js";

/**
 * The recursive topic tree.
 *
 * Rendering is a plain recursive function rather than a nested component: the
 * tree is small, and one component keeps expand/collapse state in a single place.
 */
export class PnaTopicTree extends LitElement {
  static override properties = {
    nodes: { type: Array },
    selected: { type: String },
    _collapsed: { state: true },
  };

  declare nodes: readonly TopicNode[];
  declare selected: string;
  private declare _collapsed: ReadonlySet<string>;

  constructor() {
    super();
    this.nodes = [];
    this.selected = "";
    this._collapsed = new Set();
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      ul ul {
        margin-left: 14px;
        padding-left: 10px;
        border-left: 1px solid var(--pna-border);
      }

      li {
        margin: 4px 0;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .open {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-height: var(--pna-tap);
        padding: 6px 10px;
        border: 1px solid transparent;
        border-radius: var(--pna-radius-sm);
        background: var(--pna-surface);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .open[aria-current="true"] {
        border-color: var(--pna-accent);
      }

      .title {
        font-weight: 500;
      }

      .meta {
        font-size: 0.78rem;
        color: var(--pna-text-dim);
      }

      .twisty {
        width: 28px;
        min-height: 28px;
        border: none;
        background: none;
        color: var(--pna-text-dim);
        font: inherit;
        cursor: pointer;
      }

      .twisty.hidden {
        visibility: hidden;
      }
    `,
  ];

  private toggle(id: string): void {
    const next = new Set(this._collapsed);
    if (!next.delete(id)) next.add(id);
    this._collapsed = next;
  }

  private renderNode(node: TopicNode): TemplateResult {
    const id = node.topic.id;
    const hasChildren = node.children.length > 0;
    const collapsed = this._collapsed.has(id);
    const focus = node.topic.focusAreas.length;

    return html`
      <li>
        <div class="row">
          <button
            class="twisty ${hasChildren ? "" : "hidden"}"
            aria-label=${collapsed ? "Развернуть" : "Свернуть"}
            aria-expanded=${collapsed ? "false" : "true"}
            @click=${() => this.toggle(id)}
          >
            ${collapsed ? "▸" : "▾"}
          </button>
          <button
            class="open"
            aria-current=${this.selected === id ? "true" : "false"}
            @click=${() => emit<TopicId>(this, "topic-open", id)}
          >
            <span class="title">${node.topic.title}</span>
            ${focus > 0 || hasChildren
              ? html`<span class="meta">
                  ${hasChildren ? `${node.children.length} подтем` : ""}
                  ${hasChildren && focus > 0 ? " · " : ""}
                  ${focus > 0 ? `${focus} фокусов` : ""}
                </span>`
              : null}
          </button>
        </div>
        ${hasChildren && !collapsed
          ? html`<ul>
              ${node.children.map((child) => this.renderNode(child))}
            </ul>`
          : null}
      </li>
    `;
  }

  override render() {
    if (this.nodes.length === 0) {
      return html`
        <ui-notice tone="empty" message="Тем пока нет. Создайте первую — и укажите, что именно в ней интересно.">
          <ui-button
            slot="actions"
            variant="primary"
            @click=${() => emit<TopicId | null>(this, "topic-create", null)}
            >Создать тему</ui-button
          >
        </ui-notice>
      `;
    }

    return html`<ul>
      ${this.nodes.map((node) => this.renderNode(node))}
    </ul>`;
  }
}

customElements.define("pna-topic-tree", PnaTopicTree);

declare global {
  interface HTMLElementTagNameMap {
    "pna-topic-tree": PnaTopicTree;
  }
}
