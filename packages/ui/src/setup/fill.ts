/**
 * A proposal written over a card, field by field, except where the user has
 * typed or picked something themselves — that always stays theirs.
 */
export const fillUntouched = <V, F extends keyof V>(
  fields: readonly F[],
  value: V,
  proposed: Pick<V, F>,
  touched: ReadonlySet<F>,
): V =>
  fields.reduce<V>(
    (next, field) => (touched.has(field) ? next : { ...next, [field]: proposed[field] }),
    value,
  );

/** The touched set plus the fields just edited by hand. */
export const touch = <F>(touched: ReadonlySet<F>, ...fields: readonly F[]): ReadonlySet<F> =>
  new Set([...touched, ...fields]);
