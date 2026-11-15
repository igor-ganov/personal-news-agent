import { css, html } from "lit";
import { sketchFrame, sketchLine, sketchOval } from "./path.js";

/** Each drawn element gets its own hand, so two buttons side by side differ. */
const seeds = { next: 1 };
export const nextSeed = (): number => {
  seeds.next += 1;
  return seeds.next * 7919;
};

/**
 * A box drawn round its parent; the parent must be `position: relative`. The
 * viewBox stretches to the parent, so give it roughly the parent's proportions
 * (a button is wide and short, a card nearer square) to keep the wobble about
 * two pixels on every side.
 */
export const drawnFrame = (seed: number, height = 200) =>
  html`<svg class="frame" aria-hidden="true" viewBox="0 0 200 ${height}" preserveAspectRatio="none">
    <path d=${sketchFrame({ seed, wobble: 1.6 })(200, height)}></path>
  </svg>`;

/** A pen loop circling its parent's content. */
export const drawnOval = (seed: number) =>
  html`<svg class="oval" aria-hidden="true" viewBox="0 0 80 32" preserveAspectRatio="none">
    <path d=${sketchOval({ seed, wobble: 1.6 })(80, 32)}></path>
  </svg>`;

/** A rule drawn along the bottom of its parent. */
export const drawnRule = (seed: number) =>
  html`<svg class="rule" aria-hidden="true" viewBox="0 0 354 6" preserveAspectRatio="none">
    <path d=${sketchLine({ seed, wobble: 1.4 })(0, 3, 354, 3)}></path>
  </svg>`;

/** Placement and stroke for the drawn shapes above; colour follows `currentColor`. */
export const drawnCss = css`
  .frame,
  .oval {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .oval {
    inset: -3px -6px;
    width: calc(100% + 12px);
    height: calc(100% + 6px);
  }

  .rule {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -3px;
    width: 100%;
    height: 6px;
    overflow: visible;
    pointer-events: none;
    color: var(--pna-line);
  }

  .frame path,
  .oval path,
  .rule path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
`;
