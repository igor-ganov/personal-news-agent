import type { DayNews, TopicId, TopicNode } from "@pna/core";
import { css, html, LitElement, type TemplateResult } from "lit";
import { emit } from "../events.js";
import { formatNews, formatSubtopics } from "../format/labels.js";
import { drawnIcon, iconCss } from "../sketch/icons.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-pencil-button.js";
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
    today: { type: Object },
    _collapsed: { state: true },
  };

  declare nodes: readonly TopicNode[];
  declare selected: string;
  /** What each topic holds for today; a topic missing here shows no news line. */
  declare today: Readonly<Partial<Record<string, DayNews>>>;
  private declare _collapsed: ReadonlySet<string>;

  constructor() {
    super();
    this.nodes = [];
    this.selected = "";
    this.today = {};
    this._collapsed = new Set();
  }

  static override styles = [
    baseCss,
    iconCss,
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
        border-left: 1px dashed var(--pna-line);
      }

      li {
        margin: 0;
      }

      .row {
        display: flex;
        align-items: center;
        gap: 4px;
        border-bottom: 1px solid var(--pna-line);
      }

      .open {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        min-height: var(--pna-tap);
        padding: 8px 2px 9px;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .open[aria-current="true"] .title {
        font-weight: 650;
      }

      .title {
        font-weight: 500;
        font-size: 1.05rem;
      }

      .meta {
        font-size: 0.78rem;
        color: var(--pna-text-dim);
      }

      .twisty {
        display: grid;
        place-items: center;
        flex: none;
        width: var(--pna-tap);
        min-height: var(--pna-tap);
        border: none;
        background: none;
        color: var(--pna-text-dim);
        cursor: pointer;
      }

      .twisty:focus-visible,
      .open:focus-visible {
        outline: 2px solid var(--pna-text);
        outline-offset: -2px;
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
    const news = this.today[id];
    const meta = [
      news?.kind === "ready" ? `За день: ${formatNews(news.items)}` : news ? "За день ещё не собрано" : "",
      hasChildren ? formatSubtopics(node.children.length) : "",
    ].filter((part) => part.length > 0);

    return html`
      <li>
        <div class="row">
          <button
            class="open"
            aria-current=${this.selected === id ? "true" : "false"}
            @click=${() => emit<TopicId>(this, "topic-open", id)}
          >
            <span class="title">${node.topic.title}</span>
            ${meta.length > 0 ? html`<span class="meta">${meta.join(" · ")}</span>` : null}
          </button>
          ${hasChildren
            ? html`<button
                class="twisty"
                aria-label=${collapsed ? "Развернуть" : "Свернуть"}
                aria-expanded=${collapsed ? "false" : "true"}
                @click=${() => this.toggle(id)}
              >
                ${drawnIcon(collapsed ? "closed" : "open")}
              </button>`
            : null}
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
          <ui-pencil-button
            slot="actions"
            @click=${() => emit<TopicId | null>(this, "topic-create", null)}
            >Создать тему</ui-pencil-button
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
