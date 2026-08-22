import type { LessonContent, LessonPlan, LessonStatus, PriorReference } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { formatDate } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-diagram.js";
import "../components/ui-markdown.js";
import "../components/ui-notice.js";

/**
 * One lecture: key points, the body, diagrams, links, and the two kinds of
 * anchor that make it feel current — recent news, and what the user already
 * studied in earlier programs.
 */
export class PnaLessonView extends LitElement {
  static override properties = {
    lesson: { type: Object },
    content: { type: Object },
    busy: { type: Boolean },
    error: { type: String },
    hasQuiz: { type: Boolean },
  };

  declare lesson: LessonPlan;
  declare content: LessonContent | null;
  declare busy: boolean;
  declare error: string;
  declare hasQuiz: boolean;

  constructor() {
    super();
    this.content = null;
    this.busy = false;
    this.error = "";
    this.hasQuiz = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .objective {
        margin: 0 0 var(--pna-gap);
        color: var(--pna-text-dim);
      }

      .key-points {
        margin: 0 0 var(--pna-gap-lg);
        padding: var(--pna-gap);
        background: var(--pna-surface);
        border-radius: var(--pna-radius);
      }

      .key-points ul {
        margin: 0;
        padding-left: 1.2em;
      }

      h3 {
        margin: var(--pna-gap-lg) 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pna-text-dim);
      }

      .link,
      .hook,
      .prior {
        display: block;
        padding: var(--pna-gap-sm) 0;
        border-top: 1px solid var(--pna-border);
        color: inherit;
        text-decoration: none;
      }

      .link-title {
        color: var(--pna-accent);
      }

      .why {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .actions {
        display: flex;
        gap: var(--pna-gap-sm);
        margin-top: var(--pna-gap-lg);
        flex-wrap: wrap;
      }

      .actions ui-button {
        flex: 1;
      }
    `,
  ];

  private renderPrior(reference: PriorReference) {
    return html`
      <button class="prior" @click=${() => emit(this, "lesson-open", reference.lessonId)}>
        <div class="link-title">${reference.title}</div>
        <div class="why">${reference.note}</div>
      </button>
    `;
  }

  override render() {
    const lesson = this.lesson;
    if (!lesson) return null;
    const content = this.content;

    return html`
      <div class="lesson">
        <p class="objective">${lesson.objective}</p>

        ${!content
          ? html`<div class="pending">
              <ui-notice
                tone="empty"
                message="Лекция ещё не написана. Агент соберёт её по плану и свяжет с тем, что происходит в теме прямо сейчас."
              >
                <ui-button
                  slot="actions"
                  variant="primary"
                  ?busy=${this.busy}
                  @click=${() => emit(this, "lesson-generate", null)}
                  >${this.busy ? "Пишу лекцию…" : "Сгенерировать лекцию"}</ui-button
                >
              </ui-notice>
              ${this.error ? html`<ui-notice tone="error" .message=${this.error}></ui-notice>` : null}
            </div>`
          : html`<div class="body">
              ${content.keyPoints.length > 0
                ? html`<div class="key-points">
                    <ul>
                      ${content.keyPoints.map((point) => html`<li>${point}</li>`)}
                    </ul>
                  </div>`
                : null}

              <ui-markdown .source=${content.body}></ui-markdown>

              ${content.diagrams.map(
                (diagram) => html`
                  <ui-diagram
                    .heading=${diagram.title}
                    .source=${diagram.mermaid}
                    .caption=${diagram.caption}
                  ></ui-diagram>
                `,
              )}

              ${content.newsHooks.length > 0
                ? html`<section>
                    <h3>Что происходит по теме сейчас</h3>
                    ${content.newsHooks.map(
                      (hook) => html`
                        <a class="hook" href=${hook.url} target="_blank" rel="noreferrer noopener">
                          <div class="link-title">${hook.headline}</div>
                          <div class="why">
                            ${hook.publishedAt ? `${formatDate(hook.publishedAt)} · ` : ""}${hook.relevance}
                          </div>
                        </a>
                      `,
                    )}
                  </section>`
                : null}

              ${content.links.length > 0
                ? html`<section>
                    <h3>Полезные ссылки</h3>
                    ${content.links.map(
                      (link) => html`
                        <a class="link" href=${link.url} target="_blank" rel="noreferrer noopener">
                          <div class="link-title">${link.title}</div>
                          <div class="why">${link.why}</div>
                        </a>
                      `,
                    )}
                  </section>`
                : null}

              ${content.priorReferences.length > 0
                ? html`<section>
                    <h3>Из предыдущих программ</h3>
                    ${content.priorReferences.map((reference) => this.renderPrior(reference))}
                  </section>`
                : null}

              <div class="actions">
                <ui-button ?busy=${this.busy} @click=${() => emit(this, "lesson-generate", null)}
                  >Перегенерировать</ui-button
                >
                <ui-button variant="primary" @click=${() => emit(this, "quiz-open", null)}
                  >${this.hasQuiz ? "К самопроверке" : "Собрать тест"}</ui-button
                >
                <ui-button
                  variant=${lesson.status === "done" ? "ghost" : "secondary"}
                  @click=${() =>
                    emit<LessonStatus>(
                      this,
                      "lesson-status",
                      lesson.status === "done" ? "ready" : "done",
                    )}
                  >${lesson.status === "done" ? "Снять отметку" : "Отметить пройденным"}</ui-button
                >
              </div>
            </div>`}
      </div>
    `;
  }
}

customElements.define("pna-lesson-view", PnaLessonView);

declare global {
  interface HTMLElementTagNameMap {
    "pna-lesson-view": PnaLessonView;
  }
}
