import type { DigestPeriod, Window } from "../model/digest.js";
import {
  addDays,
  addMonths,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  type Instant,
} from "../time/instant.js";

/**
 * `rolling` — "что нового за последние сутки/неделю/месяц/год", counted back from now.
 * `calendar-current` — the current day/week/month/year so far.
 * `calendar-previous` — the last complete day/week/month/year; what a scheduled digest covers.
 */
export const WINDOW_MODES = ["rolling", "calendar-current", "calendar-previous"] as const;
export type WindowMode = (typeof WINDOW_MODES)[number];

const startOfPeriod = (period: DigestPeriod, at: Instant): Instant => {
  switch (period) {
    case "day":
      return startOfDay(at);
    case "week":
      return startOfWeek(at);
    case "month":
      return startOfMonth(at);
    case "year":
      return startOfYear(at);
  }
};

const shiftBack = (period: DigestPeriod, at: Instant): Instant => {
  switch (period) {
    case "day":
      return addDays(at, -1);
    case "week":
      return addDays(at, -7);
    case "month":
      return addMonths(at, -1);
    case "year":
      return addMonths(at, -12);
  }
};

export const periodWindow = (
  period: DigestPeriod,
  now: Instant,
  mode: WindowMode = "rolling",
): Window => {
  switch (mode) {
    case "rolling":
      return { from: shiftBack(period, now), to: now };
    case "calendar-current":
      return { from: startOfPeriod(period, now), to: now };
    case "calendar-previous": {
      const currentStart = startOfPeriod(period, now);
      return { from: startOfPeriod(period, shiftBack(period, currentStart)), to: currentStart };
    }
  }
};

export const windowContains = (window: Window, at: Instant): boolean =>
  at >= window.from && at < window.to;

/** Approximate length in days — used for wording and for freshness rules. */
export const periodDays = (period: DigestPeriod): number => {
  switch (period) {
    case "day":
      return 1;
    case "week":
      return 7;
    case "month":
      return 30;
    case "year":
      return 365;
  }
};
