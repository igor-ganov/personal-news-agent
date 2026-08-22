import { DIGEST_PERIODS, type Digest, type DigestPeriod } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { PERIOD_LABEL, PERIOD_QUESTION } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-chip.js";
import "../components/ui-notice.js";
import "./pna-digest-view.js";

/**
 * The news half of a topic: pick a period, see the stored digest for it, or ask
 * for a fresh one. Each period keeps its own busy state so a running weekly
 * digest does not lock the daily button.
 */
export class PnaDigestPanel extends LitElement {
  static override properties = {
    digests: { type: Object },
    busyPeriods: { type: Array },
    error: { type: String },
    period: { type: String },
  };

  declare digests: Readonly<Partial<Record<DigestPeriod, Digest>>>;
  declare busyPeriods: readonly DigestPeriod[];
  declare error: string;
  declare period: DigestPeriod;

  constructor() {
    super();
    this.digests = {};
    this.busyPeriods = [];
    this.error = "";
    this.period = "day";
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
    `,
  ];

  override render() {
    const current = this.digests[this.period];
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
