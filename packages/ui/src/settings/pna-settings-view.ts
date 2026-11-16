import { DIGEST_PERIODS, type DigestPeriod, type Settings } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { PERIOD_LABEL } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-check.js";
import "../components/ui-chip.js";
import "../components/ui-stepper.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";

export const MODEL_CHOICES = [
  { id: "claude-opus-5-5", label: "Opus 5.5 — лучшее качество" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5 — быстрее и дешевле" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5 — самый дешёвый" },
] as const;

/**
 * Settings.
 *
 * The API key is write-only from the UI's point of view: the field starts empty
 * and only the mask of the stored key is ever displayed back.
 */
export class PnaSettingsView extends LitElement {
  static override properties = {
    settings: { type: Object },
    apiKeyMask: { type: String },
    providerId: { type: String },
    keyNote: { type: String },
    keyMissing: { type: Boolean },
    _key: { state: true },
  };

  declare settings: Settings;
  declare apiKeyMask: string;
  declare providerId: string;
  /** One line on where generation runs with the current key, or "" when nothing is known. */
  declare keyNote: string;
  /** No key anywhere: the app runs on demonstration content until one is saved. */
  declare keyMissing: boolean;
  private declare _key: string;

  constructor() {
    super();
    this.apiKeyMask = "не задан";
    this.providerId = "anthropic";
    this.keyNote = "";
    this.keyMissing = false;
    this._key = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      section {
        margin-bottom: var(--pna-gap-lg);
      }

      h3 {
        margin: 0 0 var(--pna-gap-sm);
        font-size: 0.95rem;
        font-style: italic;
        font-weight: 600;
        color: var(--pna-text-dim);
      }

      .chips {
        display: flex;
        gap: var(--pna-gap-sm);
        flex-wrap: wrap;
      }

      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--pna-gap-sm);
        min-height: var(--pna-tap);
      }

      .key-actions {
        display: flex;
        gap: var(--pna-gap-sm);
        margin-top: var(--pna-gap-sm);
      }

      .mask {
        font-family: var(--pna-mono);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .hint {
        margin: 4px 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .missing {
        margin: 0 0 var(--pna-gap-sm);
        color: var(--pna-danger);
      }
    `,
  ];

  private patch(patch: Partial<Settings>): void {
    emit<Partial<Settings>>(this, "settings-change", patch);
  }

  private togglePeriod(period: DigestPeriod): void {
    const current = this.settings.autoDigestPeriods;
    this.patch({
      autoDigestPeriods: current.includes(period)
        ? current.filter((p) => p !== period)
        : [...current, period],
    });
  }

  override render() {
    const settings = this.settings;
    if (!settings) return null;

    return html`
      <div class="settings">
        <section>
          <h3>Ключ API</h3>
          ${this.keyMissing
            ? html`<p class="missing">Ключа нет — материалы пока демонстрационные.</p>`
            : html`<div class="row"><span>Сейчас</span><span class="mask">${this.apiKeyMask}</span></div>`}
          ${this.keyNote ? html`<p class="hint">${this.keyNote}</p>` : null}
          <ui-field
            label="Новый ключ API"
            input-type="password"
            placeholder="sk-ant-…"
            .value=${this._key}
            @field-input=${(e: CustomEvent<string>) => (this._key = e.detail)}
          ></ui-field>
          <div class="key-actions">
            <ui-button
              variant="primary"
              @click=${() => {
                emit<string>(this, "api-key-save", this._key);
                this._key = "";
              }}
              >Сохранить</ui-button
            >
            ${this.keyMissing
              ? null
              : html`<ui-button variant="danger" @click=${() => emit(this, "api-key-clear", null)}
                  >Удалить ключ</ui-button
                >`}
          </div>
          <p class="hint">Хранится только на этом устройстве, в защищённом слоте.</p>
        </section>

        <section>
          <h3>Модель</h3>
          <div class="chips">
            ${MODEL_CHOICES.map(
              (choice) => html`
                <ui-chip
                  selectable
                  ?selected=${settings.model === choice.id}
                  @click=${() => this.patch({ model: choice.id })}
                  >${choice.label}</ui-chip
                >
              `,
            )}
          </div>
        </section>

        <section>
          <h3>Источники</h3>
          <ui-check
            label="Пополнять список автоматически"
            .checked=${settings.autoRefreshSources}
            @check-change=${(e: CustomEvent<boolean>) => this.patch({ autoRefreshSources: e.detail })}
          ></ui-check>
          <div class="row">
            <span>Обновлять раз в</span>
            <ui-stepper
              label="Дней между обновлениями"
              unit="дн."
              .min=${1}
              .max=${60}
              .value=${settings.sourceRefreshDays}
              @stepper-change=${(e: CustomEvent<number>) => this.patch({ sourceRefreshDays: e.detail })}
            ></ui-stepper>
          </div>
          <p class="hint">Блеклист и добавленные вручную источники не трогаются.</p>
        </section>

        <section>
          <h3>Дайджесты по расписанию</h3>
          <div class="chips">
            ${DIGEST_PERIODS.map(
              (period) => html`
                <ui-chip
                  selectable
                  multiple
                  ?selected=${settings.autoDigestPeriods.includes(period)}
                  @click=${() => this.togglePeriod(period)}
                  >${PERIOD_LABEL[period]}</ui-chip
                >
              `,
            )}
          </div>
        </section>
      </div>
    `;
  }
}

customElements.define("pna-settings-view", PnaSettingsView);

declare global {
  interface HTMLElementTagNameMap {
    "pna-settings-view": PnaSettingsView;
  }
}
