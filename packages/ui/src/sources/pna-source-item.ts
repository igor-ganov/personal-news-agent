import type { Source, SourceId, SourceStatus } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { KIND_LABEL, STATUS_LABEL } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";

export interface SourceStatusChange {
  readonly id: SourceId;
  readonly status: SourceStatus;
}

const TONE: Record<SourceStatus, "ok" | "neutral" | "danger"> = {
  active: "ok",
  muted: "neutral",
  blacklisted: "danger",
};

/**
 * One source row.
 *
 * Blacklisting is offered as a first-class action rather than deletion, because
 * a blacklisted source is what stops auto-discovery from proposing it again.
 */
export class PnaSourceItem extends LitElement {
  static override properties = {
    source: { type: Object },
  };

  declare source: Source;

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      article {
        padding: var(--pna-gap-sm) 0;
        border-bottom: 1px solid var(--pna-border);
      }

      .title {
        font-weight: 500;
      }

      a {
        color: var(--pna-accent);
        font-size: 0.82rem;
        word-break: break-all;
      }

      .why {
        margin: 4px 0;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: 6px 0;
      }

      .actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
    `,
  ];

  private change(status: SourceStatus): void {
    emit<SourceStatusChange>(this, "source-status", { id: this.source.id, status });
  }

  override render() {
    const source = this.source;
    if (!source) return null;

    return html`
      <article>
        <div class="title">${source.title}</div>
        <a href=${source.url} target="_blank" rel="noreferrer noopener">${source.url}</a>
        ${source.rationale ? html`<p class="why">${source.rationale}</p>` : null}
        <div class="tags">
          <ui-chip tone=${TONE[source.status]}>${STATUS_LABEL[source.status]}</ui-chip>
          <ui-chip>${KIND_LABEL[source.kind]}</ui-chip>
          <ui-chip>${source.origin === "user" ? "добавлен вручную" : "найден автоматически"}</ui-chip>
        </div>
        <div class="actions">
          ${source.status !== "active"
            ? html`<ui-button size="sm" @click=${() => this.change("active")}>Включить</ui-button>`
            : html`<ui-button size="sm" @click=${() => this.change("muted")}>Приглушить</ui-button>`}
          ${source.status !== "blacklisted"
            ? html`<ui-button size="sm" variant="danger" @click=${() => this.change("blacklisted")}
                >В блеклист</ui-button
              >`
            : null}
          <ui-button size="sm" variant="ghost" @click=${() =>
            emit<SourceId>(this, "source-forget", source.id)}
            >Забыть</ui-button
          >
        </div>
      </article>
    `;
  }
}

customElements.define("pna-source-item", PnaSourceItem);

declare global {
  interface HTMLElementTagNameMap {
    "pna-source-item": PnaSourceItem;
  }
}
