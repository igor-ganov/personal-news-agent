import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { formatCount } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";

const topics = (n: number): string => formatCount(n, ["тема", "темы", "тем"]);
const byTopics = (n: number): string => formatCount(n, ["теме", "темам", "темам"]);

/** What today holds across every topic, in one line. */
const summary = (ready: number, total: number): string =>
  ready === 0
    ? "За сегодня ещё ничего не собрано"
    : ready === total
      ? "Сегодня собрано по всем темам"
      : `Сегодня собрано по ${ready} из ${topics(total)}`;

/**
 * The first thing on the topic list: one line on today, and one action that
 * gathers the day's news for every topic still missing it — so starting the
 * day takes a tap, not a topic, a period and a button.
 */
export class PnaToday extends LitElement {
  static override properties = {
    total: { type: Number },
    ready: { type: Number },
    running: { type: Number },
  };

  declare total: number;
  declare ready: number;
  /** Topics whose day digest is being gathered right now. */
  declare running: number;

  constructor() {
    super();
    this.total = 0;
    this.ready = 0;
    this.running = 0;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
        margin-bottom: var(--pna-gap-lg);
      }

      h2 {
        margin: 0 0 var(--pna-gap-sm);
        font-size: 1.05rem;
        font-weight: 600;
      }

      p {
        margin: var(--pna-gap-sm) 0 0;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      ui-button {
        width: 100%;
      }
    `,
  ];

  override render() {
    const missing = this.total - this.ready;
    return html`
      <section aria-labelledby="today">
        <h2 id="today">${summary(this.ready, this.total)}</h2>
        ${this.running > 0
          ? html`<ui-button variant="primary" busy>Собираю по ${byTopics(this.running)}</ui-button>
              <p>Соберётся на сервере — приложение можно закрыть.</p>`
          : missing > 0
            ? html`<ui-button variant="primary" @click=${() => emit(this, "today-collect", null)}
                >Собрать новости за день</ui-button
              >`
            : null}
      </section>
    `;
  }
}

customElements.define("pna-today", PnaToday);

declare global {
  interface HTMLElementTagNameMap {
    "pna-today": PnaToday;
  }
}
