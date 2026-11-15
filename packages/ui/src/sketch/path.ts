/**
 * Hand-drawn strokes, returned in SVG path syntax. Each stroke is a cubic curve whose points
 * stray from the ruler by a seeded amount, so the same seed always draws the same
 * line and a re-render never makes the page shimmer.
 */
export interface SketchHand {
  readonly seed: number;
  /** The largest distance, in user units, any point may stray from the ruler. */
  readonly wobble: number;
}

/** A pseudo-random value in [-0.5, 0.5) for the n-th point of a seed (mulberry32 step). */
const jitter = (seed: number, n: number): number => {
  const a = (seed * 0x9e3779b1 + n * 0x85ebca6b) >>> 0;
  const b = Math.imul(a ^ (a >>> 15), a | 1);
  const c = (b ^ (b + Math.imul(b ^ (b >>> 7), b | 61))) >>> 0;
  return ((c ^ (c >>> 14)) >>> 0) / 4294967296 - 0.5;
};

const fixed = (n: number): string => n.toFixed(1);

/** Ends and middle control points stray half as far as the bends between them. */
const REACH = [1, 1, 1, 2, 1, 2, 1, 1] as const;

const strokeAt =
  (hand: SketchHand, offset: number) =>
  (x1: number, y1: number, x2: number, y2: number): string => {
    const ruler = [
      x1, y1,
      x1 + (x2 - x1) / 3, y1 + (y2 - y1) / 3,
      x1 + ((x2 - x1) * 2) / 3, y1 + ((y2 - y1) * 2) / 3,
      x2, y2,
    ];
    const p = ruler.map((v, i) => fixed(v + jitter(hand.seed, offset + i) * hand.wobble * REACH[i]!));
    return `M${p[0]} ${p[1]} C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}`;
  };

/** One straight stroke from (x1, y1) to (x2, y2). */
export const sketchLine = (hand: SketchHand) => strokeAt(hand, 0);

/** A box of the given size drawn as four overlapping strokes, kept inside the box. */
export const sketchFrame =
  (hand: SketchHand) =>
  (width: number, height: number): string => {
    const m = hand.wobble + 1;
    const [l, t, r, b] = [m, m, width - m, height - m];
    return [
      strokeAt(hand, 0)(l, t, r, t),
      strokeAt(hand, 8)(r, t, r, b),
      strokeAt(hand, 16)(r, b, l, b),
      strokeAt(hand, 24)(l, b, l, t),
    ].join(" ");
  };

/**
 * A loop drawn around a word, the way a pen circles an answer: four quarter
 * curves round the box, then a short overshoot past the start.
 */
export const sketchOval =
  (hand: SketchHand) =>
  (width: number, height: number): string => {
    const m = hand.wobble / 2 + 1;
    const [cx, cy, rx, ry] = [width / 2, height / 2, width / 2 - m, height / 2 - m];
    const k = 0.5523;
    const points: readonly (readonly [number, number])[] = [
      [cx - rx * 0.2, cy - ry],
      [cx + rx * k, cy - ry], [cx + rx, cy - ry * k], [cx + rx, cy],
      [cx + rx, cy + ry * k], [cx + rx * k, cy + ry], [cx, cy + ry],
      [cx - rx * k, cy + ry], [cx - rx, cy + ry * k], [cx - rx, cy],
      [cx - rx, cy - ry * k], [cx - rx * k, cy - ry], [cx, cy - ry],
      [cx + rx * 0.2, cy - ry], [cx + rx * 0.35, cy - ry * 0.97], [cx + rx * 0.5, cy - ry * 0.88],
    ];
    const p = points.map(([x, y], i) =>
      `${fixed(x + jitter(hand.seed, i * 2) * hand.wobble)} ${fixed(y + jitter(hand.seed, i * 2 + 1) * hand.wobble)}`,
    );
    return `M${p[0]} C${p[1]} ${p[2]} ${p[3]} C${p[4]} ${p[5]} ${p[6]} C${p[7]} ${p[8]} ${p[9]} C${p[10]} ${p[11]} ${p[12]} C${p[13]} ${p[14]} ${p[15]}`;
  };
