import { instantOf, type Instant } from "@pna/core";

/**
 * Parses a date the model wrote. Anything unparseable — including the empty
 * string the schemas use for "unknown" — becomes `null` rather than a bogus date.
 */
export const parseModelInstant = (raw: string): Instant | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return instantOf(parsed);
};
