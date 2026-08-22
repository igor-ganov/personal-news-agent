import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  calendarDayOf,
  dayStart,
  daysBetween,
  earliest,
  fixedClock,
  instantOf,
  latest,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "./instant.js";

const at = (s: string) => instantOf(s);

describe("instant", () => {
  it("normalises any date input to UTC ISO", () => {
    expect(at("2026-08-22T10:00:00+02:00")).toBe("2026-08-22T08:00:00.000Z");
  });

  it("gives a deterministic clock for tests", () => {
    const clock = fixedClock(at("2026-08-22T10:00:00Z"));
    expect(clock.now()).toBe(clock.now());
  });

  it("adds days across a month boundary", () => {
    expect(addDays(at("2026-01-31T12:00:00Z"), 1)).toBe("2026-02-01T12:00:00.000Z");
  });

  it("clamps month arithmetic to the last valid day", () => {
    expect(addMonths(at("2026-01-31T00:00:00Z"), 1)).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths(at("2026-03-15T00:00:00Z"), -1)).toBe("2026-02-15T00:00:00.000Z");
    expect(addMonths(at("2026-12-15T00:00:00Z"), 1)).toBe("2027-01-15T00:00:00.000Z");
  });

  it("truncates to day, ISO week, month and year", () => {
    const sunday = at("2026-08-23T18:45:00Z");
    expect(startOfDay(sunday)).toBe("2026-08-23T00:00:00.000Z");
    // 2026-08-23 is a Sunday, so its ISO week began Monday the 17th.
    expect(startOfWeek(sunday)).toBe("2026-08-17T00:00:00.000Z");
    expect(startOfMonth(sunday)).toBe("2026-08-01T00:00:00.000Z");
    expect(startOfYear(sunday)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("treats Monday as the first day of its own week", () => {
    expect(startOfWeek(at("2026-08-17T09:00:00Z"))).toBe("2026-08-17T00:00:00.000Z");
  });

  it("converts to and from calendar days", () => {
    expect(calendarDayOf(at("2026-08-22T23:59:59Z"))).toBe("2026-08-22");
    expect(dayStart(calendarDayOf(at("2026-08-22T23:59:59Z")))).toBe("2026-08-22T00:00:00.000Z");
  });

  it("counts whole days between instants", () => {
    expect(daysBetween(at("2026-08-01T00:00:00Z"), at("2026-08-08T00:00:00Z"))).toBe(7);
    expect(daysBetween(at("2026-08-01T00:00:00Z"), at("2026-08-08T23:00:00Z"))).toBe(7);
    expect(daysBetween(at("2026-08-08T00:00:00Z"), at("2026-08-01T00:00:00Z"))).toBe(-7);
  });

  it("picks the earliest and latest instant", () => {
    const a = at("2026-01-01T00:00:00Z");
    const b = at("2026-06-01T00:00:00Z");
    expect(earliest(a, b)).toBe(a);
    expect(latest(a, b)).toBe(b);
  });
});
