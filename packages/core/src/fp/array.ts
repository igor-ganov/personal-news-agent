/** Small pure array/record helpers. No mutation, ever. */

export const uniqueBy = <T, K>(items: readonly T[], key: (item: T) => K): T[] => {
  const seen = new Set<K>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
};

export const groupBy = <T, K extends string>(
  items: readonly T[],
  key: (item: T) => K,
): Record<K, T[]> => {
  const out = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
};

/** Stable sort by a computed comparable key. */
export const sortBy = <T>(
  items: readonly T[],
  key: (item: T) => number | string,
): T[] =>
  [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });

export const partition = <T>(
  items: readonly T[],
  predicate: (item: T) => boolean,
): [T[], T[]] => {
  const yes: T[] = [];
  const no: T[] = [];
  for (const item of items) (predicate(item) ? yes : no).push(item);
  return [yes, no];
};

export const chunk = <T>(items: readonly T[], size: number): T[][] => {
  if (size <= 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Distributes `total` units across `buckets` as evenly as possible, largest-first. */
export const distributeEvenly = (total: number, buckets: number): number[] => {
  if (buckets <= 0 || total < 0) return [];
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < remainder ? 1 : 0));
};
