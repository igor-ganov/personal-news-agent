import {
  CONTINUATION_MODES,
  WIZARD_INTENSITY,
  type CalendarDay,
  type ContinuationMode,
  type Intensity,
  type ProgramId,
  type Schedule,
  type Setup,
  type SkillProgram,
  type Suggestion,
} from "@pna/core";
import { css, html, LitElement, type PropertyValues } from "lit";
import { emit } from "../events.js";
import {
  CONTINUATION_HINT,
  CONTINUATION_LABEL,
  formatSessions,
} from "../format/labels.js";
import { fillUntouched, touch } from "../setup/fill.js";
import { renderSetupStatus } from "../setup/setup-status.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";
import "../suggestions/pna-suggestions.js";

export interface ProgramRequest {
  readonly intent: string;
  readonly schedule: Schedule;
  readonly basedOn: readonly ProgramId[];
  readonly continuation: ContinuationMode;
}

type IntensityField = keyof Intensity;

const INTENSITY_FIELDS: readonly IntensityField[] = ["weeks", "sessionsPerWeek", "minutesPerSession"];

/** One slider of the time budget: its label, unit, and range. */
interface SliderSpec {
  readonly field: IntensityField;
  readonly label: string;
  readonly suffix: string;
}

const SLIDERS: readonly SliderSpec[] = [
  { field: "weeks", label: "Длительность", suffix: " нед." },
  { field: "sessionsPerWeek", label: "Занятий в неделю", suffix: "" },
  { field: "minutesPerSession", label: "Минут за раз", suffix: " мин" },
];

const DEFAULT_INTENSITY: Intensity = { weeks: 4, sessionsPerWeek: 3, minutesPerSession: 45 };

/**
 * Collects what the plan should be built from: the intent, the time budget, and
 * which existing programs this one continues — the "скилл на основе скилов" case.
 *
 * Once the goal is committed (or picked from an idea) it asks for a time budget
 * (`setup-request`) and moves every slider the user has not moved themselves.
 */
export class PnaProgramWizard extends LitElement {
  static override properties = {
    availableBases: { type: Array },
    startDay: { type: String },
    busy: { type: Boolean },
    error: { type: String },
    initial: { type: Object },
    ideas: { type: Array },
    ideasBusy: { type: Boolean },
    ideasError: { type: String },
    setup: { type: Object },
    setupBusy: { type: Boolean },
    setupError: { type: String },
    _picked: { state: true },
    _intent: { state: true },
    _intensity: { state: true },
    _continuation: { state: true },
    _basedOn: { state: true },
  };

  declare availableBases: readonly SkillProgram[];
  declare startDay: string;
  declare busy: boolean;
  declare error: string;
  /**
   * A request to start from — the one a failed or still running plan was made
   * with, so asking again does not mean typing it all again.
   */
  declare initial: ProgramRequest | undefined;
  /** Skills to start from; the screen fetches them on `suggestions-more`. */
  declare ideas: readonly Suggestion[];
  declare ideasBusy: boolean;
  declare ideasError: string;
  /** A time budget proposed for the goal; applied to every slider the user has not moved. */
  declare setup: Setup | undefined;
  declare setupBusy: boolean;
  declare setupError: string;
  private declare _picked: string;
  private declare _intent: string;
  private declare _intensity: Intensity;
  private declare _continuation: ContinuationMode;
  private declare _basedOn: readonly ProgramId[];
  private touched: ReadonlySet<IntensityField> = new Set();
  /** The goal a budget was last asked for, so leaving the field again asks nothing new. */
  private asked = "";

  constructor() {
    super();
    this.availableBases = [];
    this.startDay = "";
    this.busy = false;
    this.error = "";
    this.initial = undefined;
    this.ideas = [];
    this.ideasBusy = false;
    this.ideasError = "";
    this.setup = undefined;
    this.setupBusy = false;
    this.setupError = "";
    this._picked = "";
    this._intent = "";
    this._intensity = DEFAULT_INTENSITY;
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

      .budget,
      .setup-status {
        margin-top: var(--pna-gap-sm);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .setup-status {
        margin-bottom: 0;
        min-height: 1em;
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

  /** A slider moved by hand: no proposal moves it again. */
  private move(field: IntensityField, value: number): void {
    this.touched = touch(this.touched, field);
    this._intensity = { ...this._intensity, [field]: value };
  }

  private slider({ field, label, suffix }: SliderSpec) {
    const { min, max } = WIZARD_INTENSITY[field];
    const value = this._intensity[field];
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
          @input=${(e: Event) => this.move(field, Number((e.target as HTMLInputElement).value))}
        />
        <span>${value}${suffix}</span>
      </div>
    `;
  }

  /** The request last copied into the form, so a re-render does not undo typing. */
  private prefilled = "";

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("initial") && this.initial) this.reopen(this.initial);
    if (changed.has("setup") && this.setup?.kind === "skill") {
      this._intensity = fillUntouched(INTENSITY_FIELDS, this._intensity, this.setup, this.touched);
    }
  }

  private reopen(request: ProgramRequest): void {
    const fingerprint = JSON.stringify(request);
    if (fingerprint === this.prefilled) return;
    this.prefilled = fingerprint;
    this.prefill(request);
  }

  /** A reopened request's budget was chosen by the user, so it counts as touched. */
  private prefill(request: ProgramRequest): void {
    this._intent = request.intent;
    this._intensity = request.schedule.intensity;
    this.touched = new Set(INTENSITY_FIELDS);
    this.asked = request.intent.trim();
    this._continuation = request.continuation;
    this._basedOn = request.basedOn;
  }

  /** The goal was committed: ask for a budget for it, once per goal. */
  private commitIntent(intent: string): void {
    const goal = intent.trim();
    if (goal.length === 0 || goal === this.asked) return;
    this.asked = goal;
    emit<string>(this, "setup-request", goal);
  }

  /** A picked skill becomes the goal, written out in full and left to edit. */
  private pick(idea: Suggestion): void {
    this._picked = idea.title;
    this._intent = idea.brief ? `${idea.title}: ${idea.brief}` : idea.title;
    this.commitIntent(this._intent);
  }

  private submit(): void {
    emit<ProgramRequest>(this, "program-request", {
      intent: this._intent,
      schedule: {
        startDay: this.startDay as CalendarDay,
        intensity: this._intensity,
      },
      basedOn: this._basedOn,
      continuation: this._continuation,
    });
  }

  private renderSetupStatus() {
    return renderSetupStatus({
      busy: this.setupBusy,
      error: this.setupError,
      ready: this.setup?.kind === "skill",
      working: "Подбираю длительность и темп…",
      done:
        (this.setup?.kind === "skill" && this.setup.note) ||
        "Длительность и темп подобраны по цели — их можно поправить",
    });
  }

  override render() {
    const { weeks, sessionsPerWeek } = this._intensity;
    const total = weeks * sessionsPerWeek;
    const modes = this._basedOn.length === 0 ? (["fresh"] as const) : CONTINUATION_MODES;

    return html`
      <div class="wizard">
        <section>
          <h3>Идеи навыков</h3>
          <pna-suggestions
            label="Идеи навыков"
            .ideas=${this.ideas}
            ?busy=${this.ideasBusy}
            .error=${this.ideasError}
            .picked=${this._picked}
            @suggestion-pick=${(e: CustomEvent<Suggestion>) => this.pick(e.detail)}
          ></pna-suggestions>
        </section>

        <section>
          <ui-field
            label="Чего хотите добиться"
            multiline
            rows="3"
            placeholder="Например: научиться гонять 30B локально и понимать, где теряется качество"
            .value=${this._intent}
            @field-input=${(e: CustomEvent<string>) => (this._intent = e.detail)}
            @field-change=${(e: CustomEvent<string>) => this.commitIntent(e.detail)}
          ></ui-field>
        </section>

        <section>
          <h3>Интенсивность</h3>
          <div class="sliders">${SLIDERS.map((spec) => this.slider(spec))}</div>
          ${this.renderSetupStatus()}
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
