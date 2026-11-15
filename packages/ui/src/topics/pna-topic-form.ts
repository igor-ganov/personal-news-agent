import { TOPIC_LEVELS, type Setup, type Suggestion, type Topic, type TopicLevel } from "@pna/core";
import { css, html, LitElement, type PropertyValues } from "lit";
import { emit } from "../events.js";
import { LEVEL_LABEL } from "../format/labels.js";
import { fillUntouched, touch } from "../setup/fill.js";
import { renderSetupStatus } from "../setup/setup-status.js";
import { baseCss } from "../styles/tokens.js";
import { emptyFocusRow, type FocusRow } from "./pna-focus-editor.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-field.js";
import "./pna-focus-editor.js";
import "../suggestions/pna-suggestions.js";

export interface TopicFormValue {
  readonly title: string;
  readonly brief: string;
  readonly level: TopicLevel;
  readonly excludes: readonly string[];
  readonly focusAreas: readonly FocusRow[];
}

/** The fields a proposal from the name may fill; the name itself is always the user's. */
const SETUP_FIELDS = ["brief", "level", "focusAreas", "excludes"] as const;

type SetupField = (typeof SETUP_FIELDS)[number];

const focusRows = (titles: readonly string[]): readonly FocusRow[] =>
  titles.length > 0 ? titles.map((title) => ({ title, detail: "", weight: 3 })) : [emptyFocusRow()];

/**
 * Creates or edits a topic, including its focus areas and anti-interests.
 *
 * A new card asks for settings once its name is committed (`setup-request`),
 * and fills whatever the user has not written themselves from the `setup`
 * the screen hands back. Editing an existing topic never asks.
 */
export class PnaTopicForm extends LitElement {
  static override properties = {
    topic: { type: Object },
    parentTitle: { type: String },
    error: { type: String },
    suggestible: { type: Boolean },
    ideas: { type: Array },
    ideasBusy: { type: Boolean },
    ideasError: { type: String },
    setup: { type: Object },
    setupBusy: { type: Boolean },
    setupError: { type: String },
    _picked: { state: true },
    _value: { state: true },
  };

  declare topic: Topic | null;
  declare parentTitle: string;
  declare error: string;
  /** Offers subtopic ideas above the card; the screen fetches them on `suggestions-more`. */
  declare suggestible: boolean;
  declare ideas: readonly Suggestion[];
  declare ideasBusy: boolean;
  declare ideasError: string;
  /** Settings proposed for the typed name; applied to every field the user has not touched. */
  declare setup: Setup | undefined;
  declare setupBusy: boolean;
  declare setupError: string;
  private declare _picked: string;
  private _touched: ReadonlySet<SetupField> = new Set();
  /** The name settings were last asked for, so leaving the field again asks nothing new. */
  private asked = "";
  private declare _value: TopicFormValue;

  constructor() {
    super();
    this.topic = null;
    this.parentTitle = "";
    this.error = "";
    this.suggestible = false;
    this.ideas = [];
    this.ideasBusy = false;
    this.ideasError = "";
    this.setup = undefined;
    this.setupBusy = false;
    this.setupError = "";
    this._picked = "";
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

      .setup-status {
        margin: calc(-1 * var(--pna-gap-sm)) 0 0;
        min-height: 1em;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("topic")) this.load();
    if (changed.has("setup") && this.setup?.kind === "topic") this.applySetup(this.setup);
  }

  private applySetup(setup: Extract<Setup, { kind: "topic" }>): void {
    this._value = fillUntouched(
      SETUP_FIELDS,
      this._value,
      { brief: setup.brief, level: setup.level, focusAreas: focusRows(setup.focus), excludes: setup.excludes },
      this._touched,
    );
  }

  private load(): void {
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

  /** A field the user edited by hand: no proposal writes over it again. */
  private edit<F extends SetupField>(field: F, value: TopicFormValue[F]): void {
    this._touched = touch(this._touched, field);
    this.patch({ [field]: value });
  }

  /** The name was committed: a new card asks for settings for it, once per name. */
  private commitTitle(title: string): void {
    const name = title.trim();
    if (this.topic || name.length === 0 || name === this.asked) return;
    this.asked = name;
    emit<string>(this, "setup-request", name);
  }

  /** A picked idea fills the card; the level and exclusions stay the user's. */
  private pick(idea: Suggestion): void {
    this._picked = idea.title;
    this._touched = touch(this._touched, "brief", "focusAreas");
    this.patch({ title: idea.title, brief: idea.brief, focusAreas: focusRows(idea.focus) });
  }

  private renderIdeas() {
    return html`<fieldset>
      <legend>Идеи подтем — выберите, чтобы заполнить карточку</legend>
      <pna-suggestions
        label="Идеи подтем"
        .ideas=${this.ideas}
        ?busy=${this.ideasBusy}
        .error=${this.ideasError}
        .picked=${this._picked}
        @suggestion-pick=${(e: CustomEvent<Suggestion>) => this.pick(e.detail)}
      ></pna-suggestions>
    </fieldset>`;
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
        ${this.suggestible ? this.renderIdeas() : null}

        <ui-field
          label="Название"
          placeholder="Например: Локальный инференс"
          .value=${this._value.title}
          @field-input=${(e: CustomEvent<string>) => this.patch({ title: e.detail })}
          @field-change=${(e: CustomEvent<string>) => this.commitTitle(e.detail)}
        ></ui-field>
        ${this.topic
          ? null
          : renderSetupStatus({
              busy: this.setupBusy,
              error: this.setupError,
              ready: this.setup?.kind === "topic",
              working: "Подбираю настройки по названию…",
              done: "Настройки подобраны по названию — их можно поправить",
            })}

        <ui-field
          label="Что интересно в этой теме"
          hint="Чем подробнее, тем точнее будут дайджесты и лекции"
          multiline
          rows="4"
          .value=${this._value.brief}
          @field-input=${(e: CustomEvent<string>) => this.edit("brief", e.detail)}
        ></ui-field>

        <fieldset>
          <legend>Уровень — от него зависит глубина материала</legend>
          <div class="levels">
            ${TOPIC_LEVELS.map(
              (level) => html`
                <ui-chip
                  selectable
                  ?selected=${this._value.level === level}
                  @click=${() => this.edit("level", level)}
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
              this.edit("focusAreas", e.detail)}
          ></pna-focus-editor>
        </fieldset>

        <ui-field
          label="Что не интересно"
          hint="По одному пункту в строке — это никогда не попадёт в материалы"
          multiline
          .value=${this._value.excludes.join("\n")}
          @field-input=${(e: CustomEvent<string>) =>
            this.edit("excludes", e.detail.split("\n"))}
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
