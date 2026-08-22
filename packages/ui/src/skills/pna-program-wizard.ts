import {
  CONTINUATION_MODES,
  type CalendarDay,
  type ContinuationMode,
  type ProgramId,
  type Schedule,
  type SkillProgram,
} from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import {
  CONTINUATION_HINT,
  CONTINUATION_LABEL,
  formatSessions,
} from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";

export interface ProgramRequest {
  readonly intent: string;
  readonly schedule: Schedule;
  readonly basedOn: readonly ProgramId[];
  readonly continuation: ContinuationMode;
}

/**
 * Collects what the plan should be built from: the intent, the time budget, and
 * which existing programs this one continues — the "скилл на основе скилов" case.
 */
export class PnaProgramWizard extends LitElement {
  static override properties = {
    availableBases: { type: Array },
    startDay: { type: String },
    busy: { type: Boolean },
    error: { type: String },
    _intent: { state: true },
    _weeks: { state: true },
    _sessions: { state: true },
    _minutes: { state: true },
    _continuation: { state: true },
    _basedOn: { state: true },
  };

  declare availableBases: readonly SkillProgram[];
  declare startDay: string;
  declare busy: boolean;
  declare error: string;
  private declare _intent: string;
  private declare _weeks: number;
  private declare _sessions: number;
  private declare _minutes: number;
  private declare _continuation: ContinuationMode;
  private declare _basedOn: readonly ProgramId[];

  constructor() {
    super();
    this.availableBases = [];
    this.startDay = "";
    this.busy = false;
    this.error = "";
    this._intent = "";
    this._weeks = 4;
    this._sessions = 3;
    this._minutes = 45;
    this._continuation = "fresh";
    this._basedOn = [];
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

      .sliders {
        display: flex;
        flex-direction: column;
        gap: var(--pna-gap-sm);
      }

      .slider {
        display: flex;
        align-items: center;
        gap: var(--pna-gap-sm);
      }

      .slider span:first-child {
        width: 8.5em;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .slider input {
        flex: 1;
      }

      .slider span:last-child {
        width: 3.5em;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .budget {
        margin-top: var(--pna-gap-sm);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .hint {
        margin: var(--pna-gap-sm) 0 0;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .submit ui-button {
        width: 100%;
      }
    `,
  ];

  private toggleBase(id: ProgramId): void {
    this._basedOn = this._basedOn.includes(id)
      ? this._basedOn.filter((x) => x !== id)
      : [...this._basedOn, id];
    if (this._basedOn.length > 0 && this._continuation === "fresh") this._continuation = "deepen";
    if (this._basedOn.length === 0) this._continuation = "fresh";
  }

  private slider(
    label: string,
    value: number,
    min: number,
    max: number,
    suffix: string,
    apply: (next: number) => void,
  ) {
    return html`
      <div class="slider">
        <span>${label}</span>
        <input
          type="range"
          min=${min}
          max=${max}
          step="1"
          aria-label=${label}
          .value=${String(value)}
          @input=${(e: Event) => apply(Number((e.target as HTMLInputElement).value))}
        />
        <span>${value}${suffix}</span>
      </div>
    `;
  }

  private submit(): void {
    emit<ProgramRequest>(this, "program-request", {
      intent: this._intent,
      schedule: {
        startDay: this.startDay as CalendarDay,
        intensity: {
          weeks: this._weeks,
          sessionsPerWeek: this._sessions,
          minutesPerSession: this._minutes,
        },
      },
      basedOn: this._basedOn,
      continuation: this._continuation,
    });
  }

  override render() {
    const total = this._weeks * this._sessions;
    const modes = this._basedOn.length === 0 ? (["fresh"] as const) : CONTINUATION_MODES;

    return html`
      <div class="wizard">
        <section>
          <h3>Чего хотите добиться</h3>
          <ui-field
            multiline
            rows="3"
            placeholder="Например: научиться гонять 30B локально и понимать, где теряется качество"
            .value=${this._intent}
            @field-input=${(e: CustomEvent<string>) => (this._intent = e.detail)}
          ></ui-field>
        </section>

        <section>
          <h3>Интенсивность</h3>
          <div class="sliders">
            ${this.slider("Длительность", this._weeks, 1, 26, " нед.", (n) => (this._weeks = n))}
            ${this.slider("Занятий в неделю", this._sessions, 1, 7, "", (n) => (this._sessions = n))}
            ${this.slider("Минут за раз", this._minutes, 15, 120, " мин", (n) => (this._minutes = n))}
          </div>
          <p class="budget">Получается ${formatSessions(total)} — столько лекций и попадёт в план.</p>
        </section>

        ${this.availableBases.length > 0
          ? html`
              <section>
                <h3>На основе уже пройденного</h3>
                <div class="chips">
                  ${this.availableBases.map(
                    (program) => html`
                      <ui-chip
                        selectable
                        ?selected=${this._basedOn.includes(program.id)}
                        @click=${() => this.toggleBase(program.id)}
                        >${program.title}</ui-chip
                      >
                    `,
                  )}
                </div>
              </section>
            `
          : null}

        <section>
          <h3>Как продолжаем</h3>
          <div class="chips">
            ${modes.map(
              (mode) => html`
                <ui-chip
                  selectable
                  ?selected=${this._continuation === mode}
                  @click=${() => (this._continuation = mode)}
                  >${CONTINUATION_LABEL[mode]}</ui-chip
                >
              `,
            )}
          </div>
          <p class="hint">${CONTINUATION_HINT[this._continuation]}</p>
        </section>

        ${this.error ? html`<ui-notice tone="error" .message=${this.error}></ui-notice>` : null}

        <div class="submit">
          <ui-button variant="primary" ?busy=${this.busy} @click=${() => this.submit()}>
            ${this.busy ? "Собираю план…" : "Собрать план"}
          </ui-button>
        </div>
      </div>
    `;
  }
}

customElements.define("pna-program-wizard", PnaProgramWizard);

declare global {
  interface HTMLElementTagNameMap {
    "pna-program-wizard": PnaProgramWizard;
  }
}
