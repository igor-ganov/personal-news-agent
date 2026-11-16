import { css, html, type TemplateResult } from "lit";
import { sketchLine, sketchOval, type SketchHand } from "./path.js";

/**
 * Icons drawn with the same pen as the frames and underlines: a few seeded
 * strokes on a 24-unit grid. A fixed hand per icon keeps every gear on every
 * screen identical, as a stamp would be.
 */
export type IconName =
  | "gear"
  | "cross"
  | "back"
  | "next"
  | "open"
  | "closed"
  | "up"
  | "tick"
  | "plus"
  | "minus";

const hand = (seed: number): SketchHand => ({ seed, wobble: 0.7 });
const line = (seed: number) => sketchLine(hand(seed));

/** Six teeth round a hub, each a short radial stroke. */
const gear = (): string => {
  const teeth = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return line(40 + i)(12 + c * 6.2, 12 + s * 6.2, 12 + c * 9.6, 12 + s * 9.6);
  });
  return [
    sketchOval(hand(31))(24, 24).replace(/(-?\d+\.\d) (-?\d+\.\d)/g, (_, x: string, y: string) =>
      `${(6 + Number(x) / 2).toFixed(1)} ${(6 + Number(y) / 2).toFixed(1)}`,
    ),
    ...teeth,
  ].join(" ");
};

const PATHS: Readonly<Record<IconName, () => string>> = {
  gear,
  cross: () => `${line(11)(6, 6, 18, 18)} ${line(12)(18, 6, 6, 18)}`,
  back: () => `${line(21)(15.5, 5, 8, 12)} ${line(22)(8, 12, 15.5, 19)}`,
  next: () => `${line(23)(9, 5, 16, 12)} ${line(24)(16, 12, 9, 19)}`,
  open: () => `${line(25)(6, 9, 12, 15.5)} ${line(26)(12, 15.5, 18, 9)}`,
  closed: () => `${line(27)(9.5, 6, 15.5, 12)} ${line(28)(15.5, 12, 9.5, 18)}`,
  up: () => `${line(29)(12, 19, 12, 5.5)} ${line(30)(6.5, 10.5, 12, 5)} ${line(32)(12, 5, 17.5, 10.5)}`,
  tick: () => `${line(33)(5, 12.5, 10, 17.5)} ${line(34)(10, 17.5, 19.5, 6)}`,
  plus: () => `${line(35)(12, 5, 12, 19)} ${line(36)(5, 12, 19, 12)}`,
  minus: () => line(37)(5, 12, 19, 12),
};

/** Drawn once, at module load: icons never change between renders. */
const DRAWN: Readonly<Record<IconName, string>> = Object.fromEntries(
  Object.entries(PATHS).map(([name, draw]) => [name, draw()]),
) as Record<IconName, string>;

export const drawnIcon = (name: IconName): TemplateResult =>
  html`<svg class="icon" data-icon=${name} aria-hidden="true" viewBox="0 0 24 24">
    <path d=${DRAWN[name]}></path>
  </svg>`;

export const iconCss = css`
  .icon {
    width: 22px;
    height: 22px;
    flex: none;
    overflow: visible;
  }

  .icon path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`;
