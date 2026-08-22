import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-field.js";

/** A focus area as edited on screen — no id yet, weight always present. */
export interface FocusRow {
  readonly title: string;
  readonly detail: string;
  readonly weight: number;
}

export const emptyFocusRow = (): FocusRow => ({ title: "", detail: "", weight: 3 });

/**
 * Edits the list of focus areas for a topic — "можно создать более одного
 * раздела". Emits the whole list on every change; the parent owns the state.
 */
export class PnaFocusEditor extends LitElement {
  static override properties = {
    rows: { type: Array },
  };

  declare rows: readonly FocusRow[];

  constructor() {
    super();
    this.rows = [];
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .area {
        padding: var(--pna-gap-sm);
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius-sm);
        margin-bottom: var(--pna-gap-sm);
        display: flex;
        flex-direction: column;
        gap: var(--pna-gap-sm);
      }

      .weight {
        display: flex;
        align-items: center;
        gap: var(--pna-gap-sm);
      }

      input[type="range"] {
        flex: 1;
      }

      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .index {
        font-size: 0.8rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  private change(next: readonly FocusRow[]): void {
    this.rows = next;
    emit<readonly FocusRow[]>(this, "focus-change", next);
  }

  private patch(index: number, patch: Partial<FocusRow>): void {
    this.change(this.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  override render() {
    return html`
      <div class="areas">
      ${this.rows.map(
        (row, index) => html`
          <div class="area">
            <div class="head">
              <span class="index">Раздел ${index + 1}</span>
              <ui-button size="sm" variant="danger" @click=${() =>
                this.change(this.rows.filter((_, i) => i !== index))}
                >Удалить</ui-button
              >
            </div>
            <ui-field
              label="Что именно интересно"
              placeholder="Например: латентность инференса"
              .value=${row.title}
              @field-input=${(e: CustomEvent<string>) => this.patch(index, { title: e.detail })}
            ></ui-field>
            <ui-field
              label="С фокусом на"
              placeholder="p99 на CPU, без облака, бюджет 16 ГБ"
              multiline
              .value=${row.detail}
              @field-input=${(e: CustomEvent<string>) => this.patch(index, { detail: e.detail })}
            ></ui-field>
            <div class="weight">
              <span class="small dim">Важность</span>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                .value=${String(row.weight)}
                aria-label="Важность раздела ${index + 1}"
                @input=${(e: Event) =>
                  this.patch(index, { weight: Number((e.target as HTMLInputElement).value) })}
              />
              <span class="small">${row.weight}/5</span>
            </div>
          </div>
        `,
      )}
      <ui-button @click=${() => this.change([...this.rows, emptyFocusRow()])}
        >Добавить раздел</ui-button
      >
      </div>
    `;
  }
}

customElements.define("pna-focus-editor", PnaFocusEditor);

declare global {
  interface HTMLElementTagNameMap {
    "pna-focus-editor": PnaFocusEditor;
  }
}
