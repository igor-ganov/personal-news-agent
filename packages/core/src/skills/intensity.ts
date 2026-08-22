import { err, ok, type Result } from "../fp/result.js";
import type { Intensity } from "../model/skill.js";

export type IntensityError = "weeks-out-of-range" | "sessions-out-of-range" | "minutes-out-of-range";

export const INTENSITY_LIMITS = {
  weeks: { min: 1, max: 104 },
  sessionsPerWeek: { min: 1, max: 7 },
  minutesPerSession: { min: 10, max: 240 },
} as const;

export const validateIntensity = (intensity: Intensity): Result<Intensity, IntensityError> => {
  const { weeks, sessionsPerWeek, minutesPerSession } = intensity;
  if (!Number.isInteger(weeks) || weeks < INTENSITY_LIMITS.weeks.min || weeks > INTENSITY_LIMITS.weeks.max)
    return err("weeks-out-of-range");
  if (
    !Number.isInteger(sessionsPerWeek) ||
    sessionsPerWeek < INTENSITY_LIMITS.sessionsPerWeek.min ||
    sessionsPerWeek > INTENSITY_LIMITS.sessionsPerWeek.max
  )
    return err("sessions-out-of-range");
  if (
    minutesPerSession < INTENSITY_LIMITS.minutesPerSession.min ||
    minutesPerSession > INTENSITY_LIMITS.minutesPerSession.max
  )
    return err("minutes-out-of-range");
  return ok(intensity);
};

/** How many study sessions the committed period actually contains. */
export const totalSessions = (intensity: Intensity): number =>
  intensity.weeks * intensity.sessionsPerWeek;

export const totalMinutes = (intensity: Intensity): number =>
  totalSessions(intensity) * intensity.minutesPerSession;

export interface CapacityReport {
  readonly plannedLessons: number;
  readonly availableSessions: number;
  readonly plannedMinutes: number;
  readonly availableMinutes: number;
  /** Positive when the plan asks for more than the period allows. */
  readonly lessonOverflow: number;
  readonly fits: boolean;
}

export const capacityReport = (
  intensity: Intensity,
  lessonMinutes: readonly number[],
): CapacityReport => {
  const availableSessions = totalSessions(intensity);
  const plannedMinutes = lessonMinutes.reduce((sum, m) => sum + m, 0);
  return {
    plannedLessons: lessonMinutes.length,
    availableSessions,
    plannedMinutes,
    availableMinutes: totalMinutes(intensity),
    lessonOverflow: Math.max(0, lessonMinutes.length - availableSessions),
    fits: lessonMinutes.length <= availableSessions && plannedMinutes <= totalMinutes(intensity),
  };
};

/**
 * Day offsets, within a week, for `sessionsPerWeek` sessions — spread as evenly
 * as seven days allow. 3 sessions → Mon/Wed/Fri relative to the start day.
 */
export const weeklyDayOffsets = (sessionsPerWeek: number): number[] =>
  Array.from({ length: Math.max(0, sessionsPerWeek) }, (_, i) =>
    Math.round((i * 7) / sessionsPerWeek),
  );
