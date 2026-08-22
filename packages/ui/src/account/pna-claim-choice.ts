import type { ClaimStrategy, ClaimSummary, StateCounts } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { formatCount } from "../format/labels.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";

const LINES: readonly (readonly [keyof StateCounts, [string, string, string]])[] = [
  ["topics", ["тема", "темы", "тем"]],
  ["digests", ["дайджест", "дайджеста", "дайджестов"]],
  ["programs", ["программа", "программы", "программ"]],
  ["sources", ["источник", "источника", "источников"]],
];

/** What each side holds, in words rather than a table of numbers. */
export const describeCounts = (counts: StateCounts): string => {
  const parts = LINES.filter(([key]) => counts[key] > 0).map(([key, forms]) =>
    formatCount(counts[key], forms),
  );
  return parts.length > 0 ? parts.join(", ") : "пусто";
};

/**
 * The one question signing in can have to ask.
 *
 * It appears only when both sides genuinely hold data, and it says what each
 * side is, because "merge or replace?" is unanswerable without knowing what
 * would be replaced.
 */
export class PnaClaimChoice extends LitElement {
  static override properties = {
    summary: { type: Object },
    busy: { type: Boolean },
  };

  declare summary: ClaimSummary | null;
  declare busy: boolean;

  constructor() {
    super();
    this.summary = null;
    this.busy = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      .card {
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius);
        padding: var(--pna-gap);
        background: var(--pna-surface);
      }

      h3 {
        margin: 0 0 var(--pna-gap-sm);
        font-size: 1rem;
      }

      dl {
        margin: 0 0 var(--pna-gap);
      }

      dt {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      dd {
        margin: 0 0 var(--pna-gap-sm);
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--pna-gap-sm);
      }

      .hint {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
        margin: var(--pna-gap-sm) 0 0;
      }
    `,
  ];

  private choose(strategy: ClaimStrategy): void {
    emit<ClaimStrategy>(this, "claim-choose", strategy);
  }

  override render() {
    const summary = this.summary;
    if (!summary) return null;

    return html`
      <div class="card" role="dialog" aria-label="Что сделать с данными на устройстве">
        <h3>На устройстве и в аккаунте есть данные</h3>
        <dl>
          <dt>На этом устройстве</dt>
          <dd>${describeCounts(summary.local)}</dd>
          <dt>В аккаунте</dt>
          <dd>${describeCounts(summary.account)}</dd>
        </dl>
        <div class="actions">
          <ui-button variant="primary" ?disabled=${this.busy} @click=${() => this.choose("merge")}
            >Объединить — ничего не потеряется</ui-button
          >
          <ui-button ?disabled=${this.busy} @click=${() => this.choose("keep-account")}
            >Оставить данные аккаунта</ui-button
          >
          <ui-button ?disabled=${this.busy} @click=${() => this.choose("keep-local")}
            >Оставить данные устройства</ui-button
          >
        </div>
        <p class="hint">
          При совпадении записи побеждает копия из аккаунта — её уже видели другие устройства.
        </p>
      </div>
    `;
  }
}

customElements.define("pna-claim-choice", PnaClaimChoice);

declare global {
  interface HTMLElementTagNameMap {
    "pna-claim-choice": PnaClaimChoice;
  }
}
