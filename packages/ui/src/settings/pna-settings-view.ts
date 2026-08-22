import { DIGEST_PERIODS, type DigestPeriod, type Settings } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { PERIOD_LABEL } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";

export const MODEL_CHOICES = [
  { id: "claude-opus-5", label: "Opus 5 — лучшее качество" },
  { id: "claude-sonnet-5", label: "Sonnet 5 — быстрее и дешевле" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — самый дешёвый" },
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
    _key: { state: true },
  };

  declare settings: Settings;
  declare apiKeyMask: string;
  declare providerId: string;
  private declare _key: string;

  constructor() {
    super();
    this.apiKeyMask = "не задан";
    this.providerId = "anthropic";
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
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pna-text-dim);
      }

      .chips {
        display: flex;
        gap: 6px;
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
        font-size: 0.85rem;
        color: var(--pna-text-dim);
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
          <h3>Доступ к модели</h3>
          <p class="hint">
            Ключ хранится только на устройстве, в отдельном защищённом слоте, и не попадает
            в резервную копию данных приложения.
          </p>
          <div class="row"><span>Текущий ключ</span><span class="mask">${this.apiKeyMask}</span></div>
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
            <ui-button variant="danger" @click=${() => emit(this, "api-key-clear", null)}
              >Удалить</ui-button
            >
          </div>
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
          <div class="row">
            <span>Пополнять список автоматически</span>
            <input
              type="checkbox"
              aria-label="Пополнять список автоматически"
              .checked=${settings.autoRefreshSources}
              @change=${(e: Event) =>
                this.patch({ autoRefreshSources: (e.target as HTMLInputElement).checked })}
            />
          </div>
          <p class="hint">
            Источники в блеклисте не возвращаются никогда, а добавленные вручную не переписываются.
          </p>
          <div class="row">
            <span>Обновлять не чаще чем раз в</span>
            <span>
              <input
                type="number"
                min="1"
                max="60"
                aria-label="Дней между обновлениями"
                .value=${String(settings.sourceRefreshDays)}
                @change=${(e: Event) =>
                  this.patch({ sourceRefreshDays: Number((e.target as HTMLInputElement).value) })}
              />
              дн.
            </span>
          </div>
        </section>

        <section>
          <h3>Дайджесты по расписанию</h3>
          <div class="chips">
            ${DIGEST_PERIODS.map(
              (period) => html`
                <ui-chip
                  selectable
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
