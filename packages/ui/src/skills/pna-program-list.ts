import type { ProgramId, ProgramSummary } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { CONTINUATION_LABEL, formatPercent, formatSessions } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-notice.js";
import "../components/ui-progress.js";

/** The skills half of a topic: the programs the user is running. */
export class PnaProgramList extends LitElement {
  static override properties = {
    programs: { type: Array },
  };

  declare programs: readonly ProgramSummary[];

  constructor() {
    super();
    this.programs = [];
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
        padding: var(--pna-gap);
        margin-bottom: var(--pna-gap-sm);
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius);
        background: var(--pna-surface);
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
    `,
  ];

  override render() {
    return html`
      <div class="programs">
      ${this.programs.length === 0
        ? html`<ui-notice
            tone="empty"
            message="Программ пока нет. Соберите первую: агент предложит план, а вы поправите его до запуска."
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
          <ui-button variant="primary" @click=${() => emit(this, "program-new", null)}
            >Новая программа</ui-button
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
