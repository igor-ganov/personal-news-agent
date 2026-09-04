import {
  generateLesson,
  generateQuiz,
  lessonTaskKey,
  markLesson,
  quizTaskKey,
  submitQuiz,
} from "@pna/app";
import {
  attemptsOfLesson,
  findProgramOfLesson,
  lessonContentOf,
  programLessons,
  quizOfLesson,
  type Answers,
  type LessonId,
  type LessonStatus,
} from "@pna/core";
import { routeHref } from "@pna/ui";
import { css, html } from "lit";
import { ConnectedElement } from "../context.js";
import { goBack, navigate } from "../router.js";
import "@pna/ui";

/** One session: the lecture, then the self-check. */
export class PnaLessonScreen extends ConnectedElement {
  static override properties = {
    lessonId: { type: String },
    _showQuiz: { state: true },
    _result: { state: true },
  };

  declare lessonId: LessonId;
  private declare _showQuiz: boolean;
  private declare _result: ReturnType<typeof submitQuiz> | null;

  constructor() {
    super();
    this._showQuiz = false;
    this._result = null;
  }

  static override styles = css`
    :host {
      display: block;
    }

    main {
      padding: var(--pna-gap);
    }
  `;

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("lessonId")) {
      this._showQuiz = false;
      this._result = null;
    }
  }

  private openQuiz(): void {
    this._showQuiz = true;
    this._result = null;
    if (!quizOfLesson(this.ctx.store.getState(), this.lessonId)) {
      void generateQuiz(this.ctx, this.lessonId);
    }
  }

  override render() {
    const state = this.ctx.store.getState();
    const program = findProgramOfLesson(state.programs, this.lessonId);
    const lesson = program && programLessons(program).find((l) => l.id === this.lessonId);

    if (!program || !lesson) {
      return html`
        <pna-app-bar heading="Занятие" canGoBack @go-back=${() => goBack()}></pna-app-bar>
        <main><ui-notice tone="error" message="Занятие не найдено"></ui-notice></main>
      `;
    }

    const content = lessonContentOf(state, this.lessonId) ?? null;
    const quiz = quizOfLesson(state, this.lessonId) ?? null;
    const lastAttempt = attemptsOfLesson(state, this.lessonId)[0] ?? null;

    return html`
      <pna-app-bar
        heading=${lesson.title}
        subtitle=${program.title}
        canGoBack
        @go-back=${() => {
          if (this._showQuiz) {
            this._showQuiz = false;
            return;
          }
          navigate(routeHref({ name: "program", programId: program.id }));
        }}
      >
        <ui-button
          slot="actions"
          size="sm"
          variant="ghost"
          @click=${() => {
            this._showQuiz = !this._showQuiz;
          }}
          >${this._showQuiz ? "К лекции" : "Тест"}</ui-button
        >
      </pna-app-bar>

      <main>
        ${this._showQuiz
          ? html`<pna-quiz-view
              .quiz=${quiz}
              .result=${this._result?.ok ? this._result.value.result : null}
              ?busy=${this.isBusy(quizTaskKey(this.lessonId))}
              .error=${this.taskError(quizTaskKey(this.lessonId))}
              @quiz-generate=${() => {
                this._result = null;
                void generateQuiz(this.ctx, this.lessonId);
              }}
              @quiz-submit=${(e: CustomEvent<Answers>) => {
                this._result = submitQuiz(this.ctx, this.lessonId, e.detail);
              }}
              @quiz-retry=${() => {
                this._result = null;
              }}
            ></pna-quiz-view>`
          : html`<pna-lesson-view
              .lesson=${lesson}
              .content=${content}
              ?busy=${this.isBusy(lessonTaskKey(this.lessonId))}
              .error=${this.taskError(lessonTaskKey(this.lessonId))}
              ?hasQuiz=${quiz !== null || lastAttempt !== null}
              @lesson-generate=${() => void generateLesson(this.ctx, this.lessonId)}
              @lesson-status=${(e: CustomEvent<LessonStatus>) =>
                markLesson(this.ctx, this.lessonId, e.detail)}
              @lesson-open=${(e: CustomEvent<LessonId>) =>
                navigate(routeHref({ name: "lesson", lessonId: e.detail }))}
              @quiz-open=${() => this.openQuiz()}
            ></pna-lesson-view>`}
      </main>
    `;
  }
}

customElements.define("pna-lesson-screen", PnaLessonScreen);
