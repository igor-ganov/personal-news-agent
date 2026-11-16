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
        padding: 8px 2px;
        border: none;
        border-bottom: 1.5px solid var(--pna-text-dim);
        border-radius: 0;
        background: transparent;
        color: var(--pna-text);
        font: inherit;
        resize: none;
      }

      /* A ruled sheet: each line of text sits on a pencil rule. */
      /* The sheet grows with what is written: no grip to drag, no inner scroll. */
      textarea {
        --rule: 1.6em;
        field-sizing: content;
        min-height: calc(var(--rule) * 3);
        line-height: var(--rule);
        padding-top: 0;
        border-bottom: none;
        background-image: repeating-linear-gradient(
          180deg,
          transparent 0 calc(var(--rule) - 1px),
          var(--pna-line) calc(var(--rule) - 1px) var(--rule)
        );
        background-attachment: local;
      }

      input:focus,
      textarea:focus {
        outline: none;
        border-bottom-color: var(--pna-text);
        box-shadow: 0 1.5px 0 var(--pna-text);
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

  /** `field-change` fires when the user commits a value: leaves the field or presses Enter. */
  private commit(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    this.dispatchEvent(
      new CustomEvent("field-change", { detail: target.value, bubbles: true, composed: true }),
    );
  }

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
          id="control"
          rows=${this.rows}
          .value=${this.value}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          @input=${(e: Event) => this.emit(e)}
          @change=${(e: Event) => this.commit(e)}
        ></textarea>`
      : html`<input
          id="control"
          type=${this.inputType}
          .value=${this.value}
          placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          @input=${(e: Event) => this.emit(e)}
          @change=${(e: Event) => this.commit(e)}
        />`;

    return html`
      <div class="field">
        ${this.label ? html`<label for="control">${this.label}</label>` : null} ${control}
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
