import type { Suggestion } from "@pna/core";
import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { baseCss } from "../styles/tokens.js";
import "../components/ui-button.js";
import "../components/ui-notice.js";

/**
 * A list of ideas to start a card from.
 *
 * It asks for ideas and reports the one picked; the parent fetches them and
 * fills its own card, which stays editable. Ideas are added ten at a time, so
 * the list only grows and a scrolled-to idea never moves.
 */
export class PnaSuggestions extends LitElement {
  static override properties = {
    ideas: { type: Array },
    busy: { type: Boolean },
    error: { type: String },
    picked: { type: String },
    label: { type: String },
  };

  declare ideas: readonly Suggestion[];
  declare busy: boolean;
  declare error: string;
  /** The title of the idea the card was last filled from. */
  declare picked: string;
  /** What the ideas are for, read as the list's name. */
  declare label: string;

  constructor() {
    super();
    this.ideas = [];
    this.busy = false;
    this.error = "";
    this.picked = "";
    this.label = "Варианты";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      ul {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 0 0 var(--pna-gap-sm);
        padding: 0;
        list-style: none;
      }

      li button {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        min-height: var(--pna-tap);
        padding: var(--pna-gap-sm);
        border: 1px solid var(--pna-border);
        border-radius: var(--pna-radius-sm);
        background: var(--pna-surface);
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      li button[aria-pressed="true"] {
        border-color: var(--pna-accent);
        box-shadow: inset 3px 0 0 var(--pna-accent);
      }

      li button:focus-visible {
        outline: 2px solid var(--pna-accent);
        outline-offset: 2px;
      }

      .title {
        font-weight: 600;
      }

      .summary {
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      .status {
        margin: 0 0 var(--pna-gap-sm);
        font-size: 0.85rem;
        color: var(--pna-text-dim);
      }

      ui-button {
        width: 100%;
      }
    `,
  ];

  private renderIdea(idea: Suggestion) {
    return html`<li>
      <button
        type="button"
        aria-pressed=${idea.title === this.picked ? "true" : "false"}
        @click=${() => emit<Suggestion>(this, "suggestion-pick", idea)}
      >
        <span class="title">${idea.title}</span>
        ${idea.summary ? html`<span class="summary">${idea.summary}</span>` : null}
      </button>
    </li>`;
  }

  /** Announced on change: ideas coming, or how many there are now. */
  private status(): string {
    if (this.busy) return "Подбираю варианты…";
    return this.ideas.length > 0 ? `Вариантов: ${this.ideas.length}` : "";
  }

  override render() {
    const more = this.ideas.length === 0 ? "Подобрать варианты" : "Ещё 10";
    return html`<div class="suggestions">
      ${this.ideas.length > 0
        ? html`<ul aria-label=${this.label} aria-busy=${this.busy ? "true" : "false"}>
            ${this.ideas.map((idea) => this.renderIdea(idea))}
          </ul>`
        : null}
      <p class="status" role="status">${this.status()}</p>
      ${this.error ? html`<ui-notice tone="error" message=${this.error}></ui-notice>` : null}
      <ui-button
        variant="secondary"
        ?disabled=${this.busy}
        ?busy=${this.busy}
        @click=${() => emit(this, "suggestions-more", null)}
        >${more}</ui-button
      >
    </div>`;
  }
}

customElements.define("pna-suggestions", PnaSuggestions);

declare global {
  interface HTMLElementTagNameMap {
    "pna-suggestions": PnaSuggestions;
  }
}
