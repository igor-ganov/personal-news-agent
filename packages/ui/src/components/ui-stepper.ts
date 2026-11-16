import { css, html, LitElement } from "lit";
import { emit } from "../events.js";
import { baseCss } from "../styles/tokens.js";
import "./ui-icon-button.js";

/**
 * A small whole number changed one step at a time, with two drawn buttons a
 * finger can hit — no keyboard pops up, and no value can be typed out of range.
 */
export class UiStepper extends LitElement {
  static override properties = {
    value: { type: Number },
    min: { type: Number },
    max: { type: Number },
    unit: { type: String },
    label: { type: String },
  };

  declare value: number;
  declare min: number;
  declare max: number;
  declare unit: string;
  declare label: string;

  constructor() {
    super();
    this.value = 1;
    this.min = 1;
    this.max = 99;
    this.unit = "";
    this.label = "";
  }

  static override styles = [
    baseCss,
    css`
      :host {
        display: inline-flex;
      }

      .stepper {
        display: inline-flex;
        align-items: center;
      }

      output {
        min-width: 4.5em;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
    `,
  ];

  private step(by: number): void {
    emit<number>(this, "stepper-change", Math.min(this.max, Math.max(this.min, this.value + by)));
  }

  override render() {
    return html`<div class="stepper" role="group" aria-label=${this.label}>
      <ui-icon-button
        icon="minus"
        label="Меньше"
        ?disabled=${this.value <= this.min}
        @click=${() => this.step(-1)}
      ></ui-icon-button>
      <output aria-live="polite">${this.value} ${this.unit}</output>
      <ui-icon-button
        icon="plus"
        label="Больше"
        ?disabled=${this.value >= this.max}
        @click=${() => this.step(1)}
      ></ui-icon-button>
    </div>`;
  }
}

customElements.define("ui-stepper", UiStepper);

declare global {
  interface HTMLElementTagNameMap {
    "ui-stepper": UiStepper;
  }
}
