import { emptyAnswers, type Answers, type Question, type Quiz, type QuizResult } from "@pna/core";
import { css, html, LitElement, type PropertyValues } from "lit";
import { emit } from "../events.js";
import { formatPercent } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-field.js";
import "../components/ui-notice.js";

const VERDICT_TONE = {
  correct: "ok",
  incorrect: "danger",
  unanswered: "neutral",
  "self-review": "warn",
} as const;

const VERDICT_TEXT = {
  correct: "верно",
  incorrect: "неверно",
  unanswered: "без ответа",
  "self-review": "проверьте сами",
} as const;

/**
 * The self-check.
 *
 * Answers live here until submitted; grading is the domain's job, and the
 * graded result comes back down as `result`. Open questions are never marked
 * right or wrong — they are handed back for the user to judge.
 */
export class PnaQuizView extends LitElement {
  static override properties = {
    quiz: { type: Object },
    result: { type: Object },
    busy: { type: Boolean },
    error: { type: String },
    _answers: { state: true },
  };

  declare quiz: Quiz | null;
  declare result: QuizResult | null;
  declare busy: boolean;
  declare error: string;
  private declare _answers: Answers;

  constructor() {
    super();
    this.quiz = null;
    this.result = null;
    this.busy = false;
    this.error = "";
    this._answers = emptyAnswers();
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .question {
        padding: var(--pna-gap) 0;
        border-bottom: 1px solid var(--pna-border);
      }

      .prompt {
        font-weight: 500;
        margin-bottom: var(--pna-gap-sm);
      }

      .option {
        display: flex;
        align-items: flex-start;
        gap: var(--pna-gap-sm);
        min-height: var(--pna-tap);
        padding: 6px 0;
        cursor: pointer;
      }

      .option input {
        margin-top: 4px;
        width: 20px;
        height: 20px;
      }

      .verdict {
        margin-top: var(--pna-gap-sm);
      }

      .explanation {
        margin: var(--pna-gap-sm) 0 0;
        padding-left: 8px;
        border-left: 2px solid var(--pna-border);
        font-size: 0.9rem;
        color: var(--pna-text-dim);
      }

      .score {
        margin-bottom: var(--pna-gap);
        font-weight: 600;
      }

      .actions {
        margin-top: var(--pna-gap);
        display: flex;
        gap: var(--pna-gap-sm);
      }

      .actions ui-button {
        flex: 1;
      }
    `,
  ];

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("quiz")) this._answers = emptyAnswers();
  }

  private choose(question: Question, optionId: string): void {
    const current = this._answers.choices[question.id] ?? [];
    const next =
      question.kind === "multi"
        ? current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        : [optionId];
    this._answers = { ...this._answers, choices: { ...this._answers.choices, [question.id]: next } };
  }

  private writeText(question: Question, value: string): void {
    this._answers = { ...this._answers, texts: { ...this._answers.texts, [question.id]: value } };
  }

  private renderQuestion(question: Question, index: number) {
    const selected = this._answers.choices[question.id] ?? [];
    const outcome = this.result?.results.find((r) => r.questionId === question.id);

    return html`
      <div class="question">
        <div class="prompt">${index + 1}. ${question.prompt}</div>

        ${question.kind === "open"
          ? html`<ui-field
              multiline
              rows="4"
              placeholder="Ответьте своими словами"
              .value=${this._answers.texts[question.id] ?? ""}
              ?disabled=${this.result !== null}
              @field-input=${(e: CustomEvent<string>) => this.writeText(question, e.detail)}
            ></ui-field>`
          : question.options.map(
              (option) => html`
                <label class="option">
                  <input
                    type=${question.kind === "multi" ? "checkbox" : "radio"}
                    name=${question.id}
                    .checked=${selected.includes(option.id)}
                    ?disabled=${this.result !== null}
                    @change=${() => this.choose(question, option.id)}
                  />
                  <span>${option.text}</span>
                </label>
              `,
            )}

        ${outcome
          ? html`<div class="feedback">
              <div class="verdict">
                <ui-chip tone=${VERDICT_TONE[outcome.verdict]}
                  >${VERDICT_TEXT[outcome.verdict]}</ui-chip
                >
              </div>
              ${question.kind === "open" && question.expectedPoints.length > 0
                ? html`<p class="explanation">
                    Хороший ответ содержит: ${question.expectedPoints.join("; ")}
                  </p>`
                : null}
              ${outcome.explanation
                ? html`<p class="explanation">${outcome.explanation}</p>`
                : null}
            </div>`
          : null}
      </div>
    `;
  }

  override render() {
    if (!this.quiz) {
      return html`
        <ui-notice tone="empty" message="Теста для этого занятия пока нет.">
          <ui-button
            slot="actions"
            variant="primary"
            ?busy=${this.busy}
            @click=${() => emit(this, "quiz-generate", null)}
            >${this.busy ? "Составляю…" : "Составить тест"}</ui-button
          >
        </ui-notice>
        ${this.error ? html`<ui-notice tone="error" .message=${this.error}></ui-notice>` : null}
      `;
    }

    return html`
      <div class="quiz">
      ${this.result
        ? html`<div class="score">
            ${this.result.gradedCount > 0
              ? `Результат: ${this.result.correctCount} из ${this.result.gradedCount} · ${formatPercent(this.result.score)}`
              : "Проверяемых вопросов не было"}
            ${this.result.selfReviewIds.length > 0
              ? ` · ${this.result.selfReviewIds.length} на самопроверку`
              : ""}
          </div>`
        : null}

      ${this.quiz.questions.map((question, index) => this.renderQuestion(question, index))}

      <div class="actions">
        ${this.result
          ? html`
              <ui-button @click=${() => emit(this, "quiz-retry", null)}>Пройти заново</ui-button>
              <ui-button ?busy=${this.busy} @click=${() => emit(this, "quiz-generate", null)}
                >Другие вопросы</ui-button
              >
            `
          : html`<ui-button
              variant="primary"
              @click=${() => emit<Answers>(this, "quiz-submit", this._answers)}
              >Проверить</ui-button
            >`}
        </div>
      </div>
    `;
  }
}

customElements.define("pna-quiz-view", PnaQuizView);

declare global {
  interface HTMLElementTagNameMap {
    "pna-quiz-view": PnaQuizView;
  }
}
