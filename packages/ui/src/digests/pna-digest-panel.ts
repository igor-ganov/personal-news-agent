import { DIGEST_PERIODS, type Digest, type DigestPeriod } from "@pna/core";
import { css, html, LitElement, type PropertyValues } from "lit";
import { emit } from "../events.js";
import { formatDateTimeExact, PERIOD_LABEL, PERIOD_QUESTION } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-notice.js";
import "./pna-digest-view.js";

/**
 * The news half of a topic: pick a period, read any digest ever collected for
 * it, or ask for a fresh one.
 *
 * A digest is content the user asked for, so a new one is added to the history
 * rather than replacing what is on screen. Generating one does jump to it —
 * that is what the user just pressed the button for — but the previous ones
 * stay one tap away.
 *
 * Each period keeps its own busy state, so a running weekly digest does not
 * lock the daily button.
 */
export class PnaDigestPanel extends LitElement {
  static override properties = {
    digests: { type: Object },
    busyPeriods: { type: Array },
    error: { type: String },
    period: { type: String },
    _selected: { state: true },
  };

  declare digests: Readonly<Partial<Record<DigestPeriod, readonly Digest[]>>>;
  declare busyPeriods: readonly DigestPeriod[];
  declare error: string;
  declare period: DigestPeriod;
  /** Which digest is open, per period. */
  private declare _selected: Readonly<Record<string, string>>;
  private newestSeen: Record<string, string> = {};

  constructor() {
    super();
    this.digests = {};
    this.busyPeriods = [];
    this.error = "";
    this.period = "day";
    this._selected = {};
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .periods {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: var(--pna-gap);
      }

      .ask {
        margin-bottom: var(--pna-gap);
      }

      .ask ui-button {
        width: 100%;
      }

      .history {
        margin-bottom: var(--pna-gap);
        padding-bottom: var(--pna-gap-sm);
        border-bottom: 1px solid var(--pna-border);
      }

      .history-label {
        margin: 0 0 6px;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--pna-text-dim);
      }

      .history-items {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 4px;
        scrollbar-width: none;
      }

      .history-items::-webkit-scrollbar {
        display: none;
      }
    `,
  ];

  private historyOf(period: DigestPeriod): readonly Digest[] {
    return this.digests[period] ?? [];
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has("digests") && !changed.has("period")) return;

    const history = this.historyOf(this.period);
    const newest = history[0];
    if (!newest) return;

    // A digest that was just generated becomes the one on screen; otherwise the
    // user's choice stands, unless what they were reading is gone.
    const arrived = this.newestSeen[this.period] !== newest.id;
    const chosen = this._selected[this.period];
    const stillThere = chosen !== undefined && history.some((d) => d.id === chosen);

    this.newestSeen = { ...this.newestSeen, [this.period]: newest.id };
    if (arrived || !stillThere) {
      this._selected = { ...this._selected, [this.period]: newest.id };
    }
  }

  private renderHistory(history: readonly Digest[], selectedId: string) {
    if (history.length < 2) return null;
    return html`
      <div class="history">
        <p class="history-label">История — ${history.length}</p>
        <div class="history-items">
          ${history.map(
            (digest) => html`
              <ui-chip
                selectable
                ?selected=${digest.id === selectedId}
                @click=${() => {
                  this._selected = { ...this._selected, [this.period]: digest.id };
                }}
                >${formatDateTimeExact(digest.generatedAt)}</ui-chip
              >
            `,
          )}
        </div>
      </div>
    `;
  }

  override render() {
    const history = this.historyOf(this.period);
    const selectedId = this._selected[this.period] ?? history[0]?.id ?? "";
    const current = history.find((d) => d.id === selectedId) ?? history[0];
    const busy = this.busyPeriods.includes(this.period);

    return html`
      <div class="panel">
        <div class="periods">
          ${DIGEST_PERIODS.map(
            (period) => html`
              <ui-chip
                selectable
                ?selected=${this.period === period}
                @click=${() => {
                  this.period = period;
                }}
                >${PERIOD_LABEL[period]}</ui-chip
              >
            `,
          )}
        </div>

        <div class="ask">
          <ui-button
            variant="primary"
            ?busy=${busy}
            @click=${() => emit<DigestPeriod>(this, "digest-request", this.period)}
          >
            ${busy ? "Собираю…" : PERIOD_QUESTION[this.period]}
          </ui-button>
        </div>

        ${this.error ? html`<ui-notice tone="error" .message=${this.error}></ui-notice>` : null}
        ${this.renderHistory(history, selectedId)}
        ${current
          ? html`<pna-digest-view .digest=${current}></pna-digest-view>`
          : busy
            ? null
            : html`<ui-notice
                tone="empty"
                message="Дайджеста за этот период ещё нет. Нажмите кнопку выше — агент соберёт его по источникам темы."
              ></ui-notice>`}
      </div>
    `;
  }
}

customElements.define("pna-digest-panel", PnaDigestPanel);

declare global {
  interface HTMLElementTagNameMap {
    "pna-digest-panel": PnaDigestPanel;
  }
}
