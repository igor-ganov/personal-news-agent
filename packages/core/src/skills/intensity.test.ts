import { describe, expect, it } from "vitest";
import type { Intensity } from "../model/skill.js";
import {
  capacityReport,
  totalMinutes,
  totalSessions,
  validateIntensity,
  weeklyDayOffsets,
} from "./intensity.js";

const intensity = (over: Partial<Intensity> = {}): Intensity => ({
  weeks: 4,
  sessionsPerWeek: 3,
  minutesPerSession: 45,
  ...over,
});

describe("validateIntensity", () => {
  it("accepts a sane commitment", () => {
    expect(validateIntensity(intensity())).toEqual({ ok: true, value: intensity() });
  });

  it("rejects out-of-range or fractional weeks", () => {
    expect(validateIntensity(intensity({ weeks: 0 }))).toEqual({ ok: false, error: "weeks-out-of-range" });
    expect(validateIntensity(intensity({ weeks: 200 }))).toEqual({ ok: false, error: "weeks-out-of-range" });
    expect(validateIntensity(intensity({ weeks: 1.5 }))).toEqual({ ok: false, error: "weeks-out-of-range" });
  });

  it("caps sessions at one per day", () => {
    expect(validateIntensity(intensity({ sessionsPerWeek: 7 })).ok).toBe(true);
    expect(validateIntensity(intensity({ sessionsPerWeek: 8 }))).toEqual({
      ok: false,
      error: "sessions-out-of-range",
    });
  });

  it("rejects unrealistic session lengths", () => {
    expect(validateIntensity(intensity({ minutesPerSession: 5 }))).toEqual({
      ok: false,
      error: "minutes-out-of-range",
    });
    expect(validateIntensity(intensity({ minutesPerSession: 300 }))).toEqual({
      ok: false,
      error: "minutes-out-of-range",
    });
  });
});

describe("capacity", () => {
  it("multiplies weeks by sessions", () => {
    expect(totalSessions(intensity())).toBe(12);
    expect(totalMinutes(intensity())).toBe(540);
  });

  it("reports a plan that fits", () => {
    expect(capacityReport(intensity(), Array(10).fill(45))).toMatchObject({
      plannedLessons: 10,
      availableSessions: 12,
      lessonOverflow: 0,
      fits: true,
    });
  });

  it("reports how many lessons overflow the period", () => {
    expect(capacityReport(intensity(), Array(15).fill(45))).toMatchObject({
      lessonOverflow: 3,
      fits: false,
    });
  });

  it("catches a plan that fits in sessions but not in minutes", () => {
    expect(capacityReport(intensity(), Array(12).fill(90))).toMatchObject({
      plannedMinutes: 1080,
      availableMinutes: 540,
      lessonOverflow: 0,
      fits: false,
    });
  });
});

describe("weeklyDayOffsets", () => {
  it("spreads sessions across the week", () => {
    expect(weeklyDayOffsets(1)).toEqual([0]);
    expect(weeklyDayOffsets(2)).toEqual([0, 4]);
    expect(weeklyDayOffsets(3)).toEqual([0, 2, 5]);
    expect(weeklyDayOffsets(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("never repeats a day and never leaves the week", () => {
    for (let n = 1; n <= 7; n += 1) {
      const offsets = weeklyDayOffsets(n);
      expect(new Set(offsets).size).toBe(n);
      expect(Math.max(...offsets)).toBeLessThan(7);
    }
  });
});
