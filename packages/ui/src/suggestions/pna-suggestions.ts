import type { Suggestion } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { drawnIcon, iconCss } from "../sketch/icons.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-notice.js";

/** How many ideas are on screen at once: few enough to choose between at a glance. */
export const IDEAS_AT_ONCE = 3;

/**
 * A short list of ideas to start a card from.
 *
 * It shows three at a time and reveals three more on request, asking the parent
 * for a fresh batch only when everything it holds is already on screen; the list
 * only grows, so a read idea never moves. Once one is picked the list folds to
 * that one line, and opens again if the user wants another.
 */
export class PnaSuggestions extends LitElement {
  static override properties = {
    ideas: { type: Array },
    busy: { type: Boolean },
    error: { type: String },
    picked: { type: String },
    label: { type: String },
    _visible: { state: true },
    _browsing: { state: true },
  };

  declare ideas: readonly Suggestion[];
  declare busy: boolean;
  declare error: string;
  /** The title of the idea the card was last filled from. */
  declare picked: string;
  /** What the ideas are for, read as the list's name. */
  declare label: string;
  private declare _visible: number;
  /** The user asked to see the others again after picking one. */
  private declare _browsing: boolean;

  constructor() {
    super();
    this.ideas = [];
    this.busy = false;
    this.error = "";
    this.picked = "";
    this.label = "Варианты";
    this._visible = IDEAS_AT_ONCE;
    this._browsing = false;
  }

  static override styles = [
    baseCss,
    iconCss,
    css`
      :host {
        display: block;
      }

      ul {
        margin: 0 0 var(--pna-gap-sm);
        padding: 0;
        list-style: none;
      }

      li button {
        display: flex;
        align-items: center;
        gap: var(--pna-gap-sm);
        width: 100%;
        min-height: var(--pna-tap);
        padding: 8px 2px;
        border: none;
        border-bottom: 1px solid var(--pna-line);
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      li button:focus-visible {
        outline: 2px solid var(--pna-text);
        outline-offset: -2px;
      }

      .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .title {
        font-weight: 600;
      }

      .summary {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .mark {
        width: 22px;
        flex: none;
      }

      .status {
        margin: 0;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .status:empty {
        display: none;
      }
    `,
  ];

  private pick(idea: Suggestion): void {
    this._browsing = false;
    emit<Suggestion>(this, "suggestion-pick", idea);
  }

  /** Three more from what is held; a fresh batch is asked for once those run out. */
  private more(): void {
    if (this._visible >= this.ideas.length) emit(this, "suggestions-more", null);
    this._visible = this.ideas.length === 0 ? IDEAS_AT_ONCE : this._visible + IDEAS_AT_ONCE;
  }

  private renderIdea(idea: Suggestion) {
    const picked = idea.title === this.picked;
    return html`<li>
      <button type="button" aria-pressed=${picked ? "true" : "false"} @click=${() => this.pick(idea)}>
        ${picked ? html`<span class="mark" aria-hidden="true">${drawnIcon("tick")}</span>` : null}
        <span class="text">
          <span class="title">${idea.title}</span>
          ${idea.summary ? html`<span class="summary">${idea.summary}</span>` : null}
        </span>
      </button>
    </li>`;
  }

  override render() {
    const folded = this.picked.length > 0 && !this._browsing;
    const shown = folded
      ? this.ideas.filter((idea) => idea.title === this.picked)
      : this.ideas.slice(0, this._visible);

    return html`<div class="suggestions">
      ${shown.length > 0
        ? html`<ul aria-label=${this.label} aria-busy=${this.busy ? "true" : "false"}>
            ${shown.map((idea) => this.renderIdea(idea))}
          </ul>`
        : null}
      <p class="status" role="status">${this.busy ? "Подбираю варианты…" : ""}</p>
      ${this.error ? html`<ui-notice tone="error" message=${this.error}></ui-notice>` : null}
      ${folded
        ? html`<ui-button variant="ghost" @click=${() => (this._browsing = true)}>Другие варианты</ui-button>`
        : html`<ui-button
            variant="secondary"
            ?disabled=${this.busy}
            ?busy=${this.busy}
            @click=${() => this.more()}
            >${this.ideas.length === 0 ? "Подобрать варианты" : `Ещё ${IDEAS_AT_ONCE}`}</ui-button
          >`}
    </div>`;
  }
}

customElements.define("pna-suggestions", PnaSuggestions);

declare global {
  interface HTMLElementTagNameMap {
    "pna-suggestions": PnaSuggestions;
  }
}
