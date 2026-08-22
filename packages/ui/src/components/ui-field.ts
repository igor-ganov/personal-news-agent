import { css, html, LitElement } from "lit";
import { baseCss } from "../styles/tokens.js";

/**
 * A labelled text input or textarea.
 *
 * Emits `field-input` with the current value on every keystroke, so parents
 * stay free of DOM plumbing and can pipe the value straight into a use-case.
 */
export class UiField extends LitElement {
  static override properties = {
    label: { type: String },
    value: { type: String },
    placeholder: { type: String },
    hint: { type: String },
    error: { type: String },
    multiline: { type: Boolean },
    rows: { type: Number },
    inputType: { type: String, attribute: "input-type" },
    disabled: { type: Boolean },
  };

  declare label: string;
  declare value: string;
  declare placeholder: string;
  declare hint: string;
  declare error: string;
  declare multiline: boolean;
  declare rows: number;
  declare inputType: string;
  declare disabled: boolean;

  constructor() {
    super();
    this.label = "";
    this.value = "";
    this.placeholder = "";
    this.hint = "";
    this.error = "";
    this.multiline = false;
    this.rows = 3;
    this.inputType = "text";
    this.disabled = false;
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: block;
      }

      label {
        display: block;
        font-size: 0.85rem;
        color: var(--pna-text-dim);
        margin-bottom: 4px;
      }

      input,
      textarea {
        width: 100%;
        min-height: var(--pna-tap);
        padding: 10px 12px;
        border-radius: var(--pna-radius-sm);
        border: 1px solid var(--pna-border);
        background: var(--pna-bg);
        color: var(--pna-text);
        font: inherit;
        resize: vertical;
      }

      textarea {
        line-height: 1.45;
      }

      input:focus,
      textarea:focus {
        outline: 2px solid var(--pna-accent);
        outline-offset: -1px;
      }

      .hint,
      .error {
        margin: 4px 0 0;
        font-size: 0.8rem;
      }

      .hint {
        color: var(--pna-text-dim);
      }

      .error {
        color: var(--pna-danger);
      }
    `,
  ];

  private emit(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.value = target.value;
    this.dispatchEvent(
      new CustomEvent("field-input", { detail: target.value, bubbles: true, composed: true }),
    );
  }

  override render() {
    const control = this.multiline
      ? html`<textarea
          rows=${this.rows}
          .value=${this.value}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          @input=${(e: Event) => this.emit(e)}
        ></textarea>`
      : html`<input
          type=${this.inputType}
          .value=${this.value}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          @input=${(e: Event) => this.emit(e)}
        />`;

    return html`
      <div class="field">
        ${this.label ? html`<label>${this.label}</label>` : null} ${control}
        ${this.error
          ? html`<p class="error">${this.error}</p>`
          : this.hint
            ? html`<p class="hint">${this.hint}</p>`
            : null}
      </div>
    `;
  }
}

customElements.define("ui-field", UiField);

declare global {
  interface HTMLElementTagNameMap {
    "ui-field": UiField;
  }
}
