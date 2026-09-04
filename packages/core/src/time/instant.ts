/**
 * Time primitives.
 *
 * The domain never reads the wall clock itself — it takes an `Instant` or a
 * `Clock` as an explicit input, which keeps every function pure and testable.
 * All arithmetic is done in UTC so results do not depend on the host timezone.
 */

/** An ISO-8601 timestamp in UTC, e.g. `2026-08-22T10:00:00.000Z`. */
export type Instant = string & { readonly __brand: "Instant" };

/** A calendar day in `YYYY-MM-DD` form. */
export type CalendarDay = string & { readonly __brand: "CalendarDay" };

export interface Clock {
  now(): Instant;
}

export const MS_PER_DAY = 86_400_000;

export const instantOf = (value: string | number | Date): Instant =>
  new Date(value).toISOString() as Instant;

export const toEpochMs = (instant: Instant): number => Date.parse(instant);

export const systemClock: Clock = {
  now: () => new Date().toISOString() as Instant,
};

/** A clock that always reports the same instant — the default in tests. */
export const fixedClock = (instant: Instant): Clock => ({ now: () => instant });

export const addMs = (instant: Instant, ms: number): Instant =>
  instantOf(toEpochMs(instant) + ms);

export const addDays = (instant: Instant, days: number): Instant =>
  addMs(instant, days * MS_PER_DAY);

export const addMonths = (instant: Instant, months: number): Instant => {
  const d = new Date(toEpochMs(instant));
  const targetMonth = d.getUTCMonth() + months;
  const anchor = Date.UTC(d.getUTCFullYear(), targetMonth, 1);
  const lastDayOfTarget = new Date(
    Date.UTC(new Date(anchor).getUTCFullYear(), new Date(anchor).getUTCMonth() + 1, 0),
  ).getUTCDate();
  return instantOf(
    Date.UTC(
      new Date(anchor).getUTCFullYear(),
      new Date(anchor).getUTCMonth(),
      Math.min(d.getUTCDate(), lastDayOfTarget),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
};

export const startOfDay = (instant: Instant): Instant => {
  const d = new Date(toEpochMs(instant));
  return instantOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** ISO week: starts on Monday. */
export const startOfWeek = (instant: Instant): Instant => {
  const day = new Date(toEpochMs(startOfDay(instant)));
  const isoWeekday = (day.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  return addDays(instantOf(day), -isoWeekday);
};

export const startOfMonth = (instant: Instant): Instant => {
  const d = new Date(toEpochMs(instant));
  return instantOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

export const startOfYear = (instant: Instant): Instant => {
  const d = new Date(toEpochMs(instant));
  return instantOf(Date.UTC(d.getUTCFullYear(), 0, 1));
};

export const calendarDayOf = (instant: Instant): CalendarDay =>
  instant.slice(0, 10) as CalendarDay;

/** Takes a `YYYY-MM-DD` string back into the domain — how a stored day is read. */
export const calendarDay = (raw: string): CalendarDay => raw.slice(0, 10) as CalendarDay;

export const dayStart = (day: CalendarDay): Instant => instantOf(`${day}T00:00:00.000Z`);

/** Whole days between two instants, truncated toward zero. */
export const daysBetween = (from: Instant, to: Instant): number =>
  Math.trunc((toEpochMs(to) - toEpochMs(from)) / MS_PER_DAY);

export const isBefore = (a: Instant, b: Instant): boolean => toEpochMs(a) < toEpochMs(b);
export const isAfter = (a: Instant, b: Instant): boolean => toEpochMs(a) > toEpochMs(b);

export const earliest = (a: Instant, b: Instant): Instant => (isBefore(a, b) ? a : b);
export const latest = (a: Instant, b: Instant): Instant => (isAfter(a, b) ? a : b);
