import type { CapacityReport, PlanEdit, ProgramDraft } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { formatMinutes, formatSessions } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";

/**
 * Edits a generated plan before it is committed.
 *
 * Every control emits a `PlanEdit` value; the container applies it with the
 * domain's `applyPlanEdit` and passes the new draft back down. The component
 * itself holds no plan state, so undo and validation stay in one place.
 */
export class PnaPlanEditor extends LitElement {
  static override properties = {
    draft: { type: Object },
    capacity: { type: Object },
    busy: { type: Boolean },
    error: { type: String },
  };

  declare draft: ProgramDraft;
  declare capacity: CapacityReport | null;
  declare busy: boolean;
  declare error: string;

  constructor() {
    super();
    this.capacity = null;
    this.busy = false;
    this.error = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .rationale {
        margin: 0 0 var(--pna-gap);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .module {
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius);
        padding: var(--pna-gap-sm);
        margin-bottom: var(--pna-gap-sm);
      }

      .module-head {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: var(--pna-gap-sm);
      }

      .module-head ui-field {
        flex: 1;
      }

      .lesson {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
        border-top: 1px solid var(--pna-border);
      }

      .lesson .grow {
        display: flex;
        flex-direction: column;
      }

      .lesson-title {
        font-size: 0.95rem;
      }

      .lesson-objective {
        font-size: 0.8rem;
        color: var(--pna-text-dim);
      }

      .minutes {
        width: 4.5em;
        font-size: 0.8rem;
        color: var(--pna-text-dim);
        text-align: right;
      }

      .icon {
        min-width: 32px;
        min-height: 32px;
        border: none;
        background: none;
        color: var(--pna-text-dim);
        font: inherit;
        cursor: pointer;
      }

      .actions {
        display: flex;
        gap: var(--pna-gap-sm);
        margin-top: var(--pna-gap);
      }

      .actions ui-button {
        flex: 1;
      }
    `,
  ];

  private edit(edit: PlanEdit): void {
    emit<PlanEdit>(this, "plan-edit", edit);
  }

  override render() {
    const draft = this.draft;
    if (!draft) return null;

    const capacity = this.capacity;

    return html`
      <div class="plan">
        <ui-field
          label="Название программы"
          .value=${draft.title}
          @field-input=${(e: CustomEvent<string>) =>
            this.edit({ type: "set-title", title: e.detail })}
        ></ui-field>
        <ui-field
          label="Цель"
          multiline
          rows="2"
          .value=${draft.goal}
          @field-input=${(e: CustomEvent<string>) => this.edit({ type: "set-goal", goal: e.detail })}
        ></ui-field>

        ${draft.rationale ? html`<p class="rationale">${draft.rationale}</p>` : null}

        ${capacity && !capacity.fits
          ? html`<ui-notice
              tone="info"
              message=${capacity.lessonOverflow > 0
                ? `План длиннее выбранного срока на ${formatSessions(capacity.lessonOverflow)}. Уберите лишнее или увеличьте интенсивность.`
                : `План требует ${formatMinutes(capacity.plannedMinutes)} против ${formatMinutes(capacity.availableMinutes)} по расписанию.`}
            ></ui-notice>`
          : null}

        ${draft.modules.map(
          (module, moduleIndex) => html`
            <div class="module">
              <div class="module-head">
                <ui-field
                  label="Модуль ${moduleIndex + 1}"
                  .value=${module.title}
                  @field-input=${(e: CustomEvent<string>) =>
                    this.edit({
                      type: "edit-module",
                      module: moduleIndex,
                      patch: { title: e.detail },
                    })}
                ></ui-field>
                <button
                  class="icon"
                  aria-label="Поднять модуль"
                  ?disabled=${moduleIndex === 0}
                  @click=${() =>
                    this.edit({ type: "move-module", from: moduleIndex, to: moduleIndex - 1 })}
                >
                  ↑
                </button>
                <button
                  class="icon"
                  aria-label="Удалить модуль"
                  @click=${() => this.edit({ type: "remove-module", module: moduleIndex })}
                >
                  ✕
                </button>
              </div>

              ${module.lessons.map(
                (lesson, lessonIndex) => html`
                  <div class="lesson">
                    <div class="grow">
                      <span class="lesson-title">${lesson.title}</span>
                      <span class="lesson-objective">${lesson.objective}</span>
                    </div>
                    <span class="minutes">${lesson.estimatedMinutes} мин</span>
                    <button
                      class="icon"
                      aria-label="Поднять занятие"
                      ?disabled=${lessonIndex === 0}
                      @click=${() =>
                        this.edit({
                          type: "move-lesson",
                          from: { module: moduleIndex, lesson: lessonIndex },
                          to: { module: moduleIndex, lesson: lessonIndex - 1 },
                        })}
                    >
                      ↑
                    </button>
                    <button
                      class="icon"
                      aria-label="Удалить занятие"
                      @click=${() =>
                        this.edit({
                          type: "remove-lesson",
                          module: moduleIndex,
                          lesson: lessonIndex,
                        })}
                    >
                      ✕
                    </button>
                  </div>
                `,
              )}
            </div>
          `,
        )}

        ${this.error ? html`<ui-notice tone="error" .message=${this.error}></ui-notice>` : null}

        <div class="actions">
          <ui-button @click=${() => emit(this, "plan-discard", null)}>Отменить</ui-button>
          <ui-button variant="primary" ?busy=${this.busy} @click=${() =>
            emit(this, "plan-commit", null)}
            >Запустить программу</ui-button
          >
        </div>
      </div>
    `;
  }
}

customElements.define("pna-plan-editor", PnaPlanEditor);

declare global {
  interface HTMLElementTagNameMap {
    "pna-plan-editor": PnaPlanEditor;
  }
}
