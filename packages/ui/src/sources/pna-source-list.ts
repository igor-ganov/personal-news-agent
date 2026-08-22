import { countByStatus, type Source, type UserSourceDraft } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { formatSources } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";
import "./pna-source-item.js";

/**
 * The source list for a topic.
 *
 * Blacklisted sources are collapsed behind a toggle: the user needs them to
 * stay visible enough to undo, but they are not part of the working list.
 */
export class PnaSourceList extends LitElement {
  static override properties = {
    sources: { type: Array },
    busy: { type: Boolean },
    error: { type: String },
    _showBlacklist: { state: true },
    _adding: { state: true },
    _title: { state: true },
    _url: { state: true },
  };

  declare sources: readonly Source[];
  declare busy: boolean;
  declare error: string;
  private declare _showBlacklist: boolean;
  private declare _adding: boolean;
  private declare _title: string;
  private declare _url: string;

  constructor() {
    super();
    this.sources = [];
    this.busy = false;
    this.error = "";
    this._showBlacklist = false;
    this._adding = false;
    this._title = "";
    this._url = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--pna-gap-sm);
        margin-bottom: var(--pna-gap-sm);
      }

      .counts {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .add {
        display: flex;
        flex-direction: column;
        gap: var(--pna-gap-sm);
        padding: var(--pna-gap-sm);
        border: 1px dashed var(--pna-border);
        border-radius: var(--pna-radius-sm);
        margin-bottom: var(--pna-gap);
      }

      .add-actions {
        display: flex;
        gap: var(--pna-gap-sm);
      }

      .toggle {
        margin-top: var(--pna-gap);
      }
    `,
  ];

  private submitNew(): void {
    emit<UserSourceDraft>(this, "source-add", { title: this._title, url: this._url });
    this._title = "";
    this._url = "";
    this._adding = false;
  }

  override render() {
    const counts = countByStatus(this.sources);
    const visible = this.sources.filter((s) => s.status !== "blacklisted");
    const blacklisted = this.sources.filter((s) => s.status === "blacklisted");

    return html`
      <div class="sources">
        <header>
          <span class="counts"
            >${formatSources(counts.active)} активно${counts.muted > 0
              ? `, ${counts.muted} приглушено`
              : ""}</span
          >
          <ui-button size="sm" ?busy=${this.busy} @click=${() => emit(this, "source-refresh", null)}
            >Обновить список</ui-button
          >
        </header>

        ${this.error ? html`<ui-notice tone="error" .message=${this.error}></ui-notice>` : null}

        ${this._adding
          ? html`
              <div class="add">
                <ui-field
                  label="Название"
                  .value=${this._title}
                  @field-input=${(e: CustomEvent<string>) => (this._title = e.detail)}
                ></ui-field>
                <ui-field
                  label="Ссылка"
                  placeholder="https://example.com/feed"
                  input-type="url"
                  .value=${this._url}
                  @field-input=${(e: CustomEvent<string>) => (this._url = e.detail)}
                ></ui-field>
                <div class="add-actions">
                  <ui-button size="sm" @click=${() => (this._adding = false)}>Отмена</ui-button>
                  <ui-button size="sm" variant="primary" @click=${() => this.submitNew()}
                    >Добавить</ui-button
                  >
                </div>
              </div>
            `
          : html`<ui-button size="sm" @click=${() => (this._adding = true)}
              >Добавить свой источник</ui-button
            >`}

        ${visible.length === 0
          ? html`<ui-notice
              tone="empty"
              message="Источников пока нет. Нажмите «Обновить список» — агент подберёт их по описанию темы."
            ></ui-notice>`
          : visible.map(
              (source) => html`<pna-source-item .source=${source}></pna-source-item>`,
            )}

        ${blacklisted.length > 0
          ? html`<div class="blacklist">
              <div class="toggle">
                <ui-button
                  size="sm"
                  variant="ghost"
                  @click=${() => (this._showBlacklist = !this._showBlacklist)}
                >
                  ${this._showBlacklist ? "Скрыть" : "Показать"} блеклист
                  (${blacklisted.length})
                </ui-button>
              </div>
              ${this._showBlacklist
                ? blacklisted.map(
                    (source) => html`<pna-source-item .source=${source}></pna-source-item>`,
                  )
                : null}
            </div>`
          : null}
      </div>
    `;
  }
}

customElements.define("pna-source-list", PnaSourceList);

declare global {
  interface HTMLElementTagNameMap {
    "pna-source-list": PnaSourceList;
  }
}
