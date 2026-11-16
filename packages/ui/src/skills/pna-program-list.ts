import type { ProgramId, ProgramSummary } from "@pna/core";
import { css, html, LitElement, nothing } from "lit";
import { emit } from "../events.js";
import { CONTINUATION_LABEL, formatPercent, formatSessions } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-pencil-button.js";
import "../components/ui-chip.js";
import "../components/ui-notice.js";
import "../components/ui-progress.js";
import "../components/ui-task-status.js";

/**
 * Where the topic's program generation stands. A plan that has come back is
 * not here: the screen opens the plan editor for it instead.
 */
export type ProgramTaskView =
  | { readonly kind: "idle" }
  | {
      readonly kind: "running";
      readonly since: string;
      /** What is being drafted — the goal, or the programs being built on. */
      readonly label?: string;
      readonly steps?: readonly string[];
    }
  | { readonly kind: "error"; readonly message: string };

const IDLE: ProgramTaskView = { kind: "idle" };

export const PROGRAM_RUNNING_HINT = "Агент составляет план — можно закрыть приложение, результат придёт сам";

/**
 * The skills half of a topic: the programs the user is running, and the one
 * being drafted, if any.
 *
 * The draft's status is shown whatever the screen was doing before: after a
 * restart the only trace of a plan in progress is this card.
 */
export class PnaProgramList extends LitElement {
  static override properties = {
    programs: { type: Array },
    task: { type: Object },
  };

  declare programs: readonly ProgramSummary[];
  declare task: ProgramTaskView;

  constructor() {
    super();
    this.programs = [];
    this.task = IDLE;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      button.card {
        display: block;
        width: 100%;
        text-align: left;
        padding: var(--pna-gap) 2px;
        border: none;
        border-bottom: 1px solid var(--pna-line);
        background: none;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }

      .title {
        font-weight: 600;
      }

      .goal {
        margin: 2px 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: var(--pna-gap-sm);
      }

      .new {
        margin-top: var(--pna-gap);
      }

      .new ui-button {
        width: 100%;
      }

      .task-actions {
        display: flex;
        gap: var(--pna-gap-sm);
        justify-content: center;
      }
    `,
  ];

  private renderTask() {
    const task = this.task;
    if (task.kind === "running")
      return html`<ui-task-status
        label=${task.label ?? "Составляю программу"}
        .since=${task.since}
        .steps=${task.steps ?? []}
        hint=${PROGRAM_RUNNING_HINT}
      ></ui-task-status>`;

    if (task.kind === "error")
      return html`<ui-notice tone="error" .message=${task.message}>
        <span slot="actions" class="task-actions">
          <ui-button size="sm" variant="primary" @click=${() => emit(this, "program-retry", null)}
            >Повторить</ui-button
          >
          <ui-button size="sm" @click=${() => emit(this, "program-dismiss", null)}>Убрать</ui-button>
        </span>
      </ui-notice>`;

    return nothing;
  }

  override render() {
    const running = this.task.kind === "running";
    return html`
      <div class="programs">
      ${this.renderTask()}
      ${this.programs.length === 0
        ? html`<ui-notice
            tone="empty"
            message="Программ пока нет."
          ></ui-notice>`
        : this.programs.map(
            ({ program, progress }) => html`
              <button class="card" @click=${() => emit<ProgramId>(this, "program-open", program.id)}>
                <div class="title">${program.title}</div>
                <p class="goal">${program.goal}</p>
                <div class="tags">
                  <ui-chip tone=${program.status === "completed" ? "ok" : "accent"}
                    >${CONTINUATION_LABEL[program.continuation]}</ui-chip
                  >
                  <ui-chip>${formatSessions(progress.total)}</ui-chip>
                  ${program.basedOn.length > 0
                    ? html`<ui-chip>на основе ${program.basedOn.length}</ui-chip>`
                    : null}
                </div>
                <ui-progress
                  .value=${progress.ratio}
                  caption="Пройдено ${progress.done} из ${progress.total} · ${formatPercent(
                    progress.ratio,
                  )}"
                ></ui-progress>
              </button>
            `,
          )}

        <div class="new">
          <ui-pencil-button
            ?disabled=${running}
            @click=${() => {
              if (!running) emit(this, "program-new", null);
            }}
            >Новая программа</ui-pencil-button
          >
        </div>
      </div>
    `;
  }
}

customElements.define("pna-program-list", PnaProgramList);

declare global {
  interface HTMLElementTagNameMap {
    "pna-program-list": PnaProgramList;
  }
}
