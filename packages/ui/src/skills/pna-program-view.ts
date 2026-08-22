import type { LessonId, LessonStatus, Progress, SkillProgram } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { CONTINUATION_LABEL, formatDate, formatPercent } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-chip.js";
import "../components/ui-progress.js";

const STATUS_TONE: Record<LessonStatus, "neutral" | "accent" | "ok"> = {
  planned: "neutral",
  ready: "accent",
  done: "ok",
};

const STATUS_TEXT: Record<LessonStatus, string> = {
  planned: "запланировано",
  ready: "лекция готова",
  done: "пройдено",
};

/** A committed program: its modules, its sessions and where the user is in it. */
export class PnaProgramView extends LitElement {
  static override properties = {
    program: { type: Object },
    progress: { type: Object },
    baseTitles: { type: Array },
  };

  declare program: SkillProgram;
  declare progress: Progress;
  declare baseTitles: readonly string[];

  constructor() {
    super();
    this.baseTitles = [];
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .goal {
        margin: 0 0 var(--pna-gap-sm);
        color: var(--pna-text-dim);
      }

      .tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: var(--pna-gap);
      }

      h3 {
        margin: var(--pna-gap-lg) 0 4px;
        font-size: 1rem;
      }

      .objective {
        margin: 0 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      button.lesson {
        display: flex;
        align-items: center;
        gap: var(--pna-gap-sm);
        width: 100%;
        min-height: var(--pna-tap);
        padding: var(--pna-gap-sm);
        margin-bottom: 6px;
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius-sm);
        background: var(--pna-surface);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .lesson .grow {
        display: flex;
        flex-direction: column;
      }

      .when {
        font-size: 0.78rem;
        color: var(--pna-text-dim);
      }
    `,
  ];

  override render() {
    const program = this.program;
    if (!program) return null;

    return html`
      <div class="program">
        <p class="goal">${program.goal}</p>
        <div class="tags">
          <ui-chip tone="accent">${CONTINUATION_LABEL[program.continuation]}</ui-chip>
          <ui-chip
            >${program.schedule.intensity.weeks} нед. ·
            ${program.schedule.intensity.sessionsPerWeek}/нед ·
            ${program.schedule.intensity.minutesPerSession} мин</ui-chip
          >
          ${this.baseTitles.map((title) => html`<ui-chip>на основе: ${title}</ui-chip>`)}
        </div>

        ${this.progress
          ? html`<ui-progress
              .value=${this.progress.ratio}
              caption="Пройдено ${this.progress.done} из ${this.progress.total} · ${formatPercent(
                this.progress.ratio,
              )}"
            ></ui-progress>`
          : null}

        ${program.modules.map(
          (module) => html`<section>
            <h3>${module.title}</h3>
            ${module.objective ? html`<p class="objective">${module.objective}</p>` : null}
            ${module.lessons.map(
              (lesson) => html`
                <button
                  class="lesson"
                  @click=${() => emit<LessonId>(this, "lesson-open", lesson.id)}
                >
                  <div class="grow">
                    <span>${lesson.title}</span>
                    <span class="when"
                      >${lesson.scheduledFor ? formatDate(`${lesson.scheduledFor}T00:00:00Z`) : ""} ·
                      ${lesson.estimatedMinutes} мин</span
                    >
                  </div>
                  <ui-chip tone=${STATUS_TONE[lesson.status]}>${STATUS_TEXT[lesson.status]}</ui-chip>
                </button>
              `,
            )}
          </section>`,
        )}
      </div>
    `;
  }
}

customElements.define("pna-program-view", PnaProgramView);

declare global {
  interface HTMLElementTagNameMap {
    "pna-program-view": PnaProgramView;
  }
}
