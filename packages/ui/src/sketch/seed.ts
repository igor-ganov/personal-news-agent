/** A stable seed for a piece of text, so each drawn element keeps its own hand. */
export const seedOf = (text: string): number =>
  [...text].reduce((hash, ch) => (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) >>> 0, 7);
