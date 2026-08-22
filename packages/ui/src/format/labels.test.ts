import { instantOf } from "@pna/core";
import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDate,
  formatMinutes,
  formatPercent,
  formatSessions,
  formatSources,
  formatWeeks,
  formatWindow,
  PERIOD_LABEL,
  PERIOD_QUESTION,
} from "./labels.js";

describe("dates", () => {
  it("formats an instant in Russian", () => {
    expect(formatDate(instantOf("2026-08-22T10:00:00Z"))).toMatch(/2026/);
    expect(formatDate(instantOf("2026-08-22T10:00:00Z"))).toMatch(/авг/);
  });

  it("renders nothing for a missing date", () => {
    expect(formatDate(null)).toBe("");
  });

  it("formats a window as a range", () => {
    const text = formatWindow(instantOf("2026-08-15T00:00:00Z"), instantOf("2026-08-22T00:00:00Z"));
    expect(text).toContain("—");
    expect(text.split("—")).toHaveLength(2);
  });
});

describe("Russian plurals", () => {
  it("declines by the last digits, not by size", () => {
    expect(formatSessions(1)).toBe("1 занятие");
    expect(formatSessions(2)).toBe("2 занятия");
    expect(formatSessions(5)).toBe("5 занятий");
    expect(formatSessions(11)).toBe("11 занятий");
    expect(formatSessions(21)).toBe("21 занятие");
    expect(formatSessions(112)).toBe("112 занятий");
    expect(formatSessions(0)).toBe("0 занятий");
  });

  it("applies the same rule to the other counters", () => {
    expect(formatWeeks(3)).toBe("3 недели");
    expect(formatSources(1)).toBe("1 источник");
    expect(formatMinutes(45)).toBe("45 минут");
    expect(formatCount(2, ["раз", "раза", "раз"])).toBe("2 раза");
  });
});

describe("labels", () => {
  it("names every digest period", () => {
    expect(Object.keys(PERIOD_LABEL)).toEqual(["day", "week", "month", "year"]);
    expect(PERIOD_QUESTION.week).toBe("Что нового за неделю");
  });

  it("rounds percentages", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1 / 3)).toBe("33%");
    expect(formatPercent(1)).toBe("100%");
  });
});
