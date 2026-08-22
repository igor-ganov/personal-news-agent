import { TOPIC_LEVELS, type Topic, type TopicLevel } from "@pna/core";
import { css, html, LitElement, type PropertyValues } from "lit";
import { emit } from "../events.js";
import { LEVEL_LABEL } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import { emptyFocusRow, type FocusRow } from "./pna-focus-editor.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-field.js";
import "./pna-focus-editor.js";

export interface TopicFormValue {
  readonly title: string;
  readonly brief: string;
  readonly level: TopicLevel;
  readonly excludes: readonly string[];
  readonly focusAreas: readonly FocusRow[];
}

/** Creates or edits a topic, including its focus areas and anti-interests. */
export class PnaTopicForm extends LitElement {
  static override properties = {
    topic: { type: Object },
    parentTitle: { type: String },
    error: { type: String },
    _value: { state: true },
  };

  declare topic: Topic | null;
  declare parentTitle: string;
  declare error: string;
  private declare _value: TopicFormValue;

  constructor() {
    super();
    this.topic = null;
    this.parentTitle = "";
    this.error = "";
    this._value = { title: "", brief: "", level: "intermediate", excludes: [], focusAreas: [] };
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: var(--pna-gap);
      }

      fieldset {
        border: none;
        margin: 0;
        padding: 0;
      }

      legend {
        padding: 0 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .levels {
        display: flex;
        gap: var(--pna-gap-sm);
        flex-wrap: wrap;
      }

      .actions {
        display: flex;
        gap: var(--pna-gap-sm);
      }

      .actions ui-button {
        flex: 1;
      }

      .parent {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .error {
        color: var(--pna-danger);
        font-size: 0.85rem;
      }
    `,
  ];

  override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has("topic")) return;
    this._value = this.topic
      ? {
          title: this.topic.title,
          brief: this.topic.brief,
          level: this.topic.level,
          excludes: [...this.topic.excludes],
          focusAreas: this.topic.focusAreas.map((f) => ({
            title: f.title,
            detail: f.detail,
            weight: f.weight,
          })),
        }
      : { title: "", brief: "", level: "intermediate", excludes: [], focusAreas: [emptyFocusRow()] };
  }

  private patch(patch: Partial<TopicFormValue>): void {
    this._value = { ...this._value, ...patch };
  }

  override render() {
    return html`
      <form
        @submit=${(e: Event) => {
          e.preventDefault();
          emit<TopicFormValue>(this, "topic-save", this._value);
        }}
      >
        ${this.parentTitle
          ? html`<p class="parent">Подтема темы «${this.parentTitle}»</p>`
          : null}

        <ui-field
          label="Название"
          placeholder="Например: Локальный инференс"
          .value=${this._value.title}
          @field-input=${(e: CustomEvent<string>) => this.patch({ title: e.detail })}
        ></ui-field>

        <ui-field
          label="Что интересно в этой теме"
          hint="Чем подробнее, тем точнее будут дайджесты и лекции"
          multiline
          rows="4"
          .value=${this._value.brief}
          @field-input=${(e: CustomEvent<string>) => this.patch({ brief: e.detail })}
        ></ui-field>

        <fieldset>
          <legend>Уровень — от него зависит глубина материала</legend>
          <div class="levels">
            ${TOPIC_LEVELS.map(
              (level) => html`
                <ui-chip
                  selectable
                  ?selected=${this._value.level === level}
                  @click=${() => this.patch({ level })}
                  >${LEVEL_LABEL[level]}</ui-chip
                >
              `,
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Разделы фокуса</legend>
          <pna-focus-editor
            .rows=${this._value.focusAreas}
            @focus-change=${(e: CustomEvent<readonly FocusRow[]>) =>
              this.patch({ focusAreas: e.detail })}
          ></pna-focus-editor>
        </fieldset>

        <ui-field
          label="Что не интересно"
          hint="По одному пункту в строке — это никогда не попадёт в материалы"
          multiline
          .value=${this._value.excludes.join("\n")}
          @field-input=${(e: CustomEvent<string>) =>
            this.patch({ excludes: e.detail.split("\n") })}
        ></ui-field>

        ${this.error ? html`<p class="error">${this.error}</p>` : null}

        <div class="actions">
          <ui-button type="button" @click=${() => emit(this, "topic-cancel", null)}
            >Отмена</ui-button
          >
          <ui-button
            variant="primary"
            @click=${() => emit<TopicFormValue>(this, "topic-save", this._value)}
            >${this.topic ? "Сохранить" : "Создать"}</ui-button
          >
        </div>
      </form>
    `;
  }
}

customElements.define("pna-topic-form", PnaTopicForm);

declare global {
  interface HTMLElementTagNameMap {
    "pna-topic-form": PnaTopicForm;
  }
}
