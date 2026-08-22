import { describe, expect, it } from "vitest";
import { instantOf } from "../time/instant.js";
import { periodDays, periodWindow, windowContains } from "./window.js";

// A Saturday.
const now = instantOf("2026-08-22T15:30:00Z");

describe("periodWindow — rolling", () => {
  it("counts a day back from now", () => {
    expect(periodWindow("day", now)).toEqual({
      from: "2026-08-21T15:30:00.000Z",
      to: "2026-08-22T15:30:00.000Z",
    });
  });

  it("counts a week, a month and a year back from now", () => {
    expect(periodWindow("week", now).from).toBe("2026-08-15T15:30:00.000Z");
    expect(periodWindow("month", now).from).toBe("2026-07-22T15:30:00.000Z");
    expect(periodWindow("year", now).from).toBe("2025-08-22T15:30:00.000Z");
  });
});

describe("periodWindow — calendar-current", () => {
  it("starts at the beginning of the current period", () => {
    expect(periodWindow("day", now, "calendar-current").from).toBe("2026-08-22T00:00:00.000Z");
    // The ISO week of Sat 22 Aug 2026 began on Mon 17 Aug.
    expect(periodWindow("week", now, "calendar-current").from).toBe("2026-08-17T00:00:00.000Z");
    expect(periodWindow("month", now, "calendar-current").from).toBe("2026-08-01T00:00:00.000Z");
    expect(periodWindow("year", now, "calendar-current").from).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ends at now, not at the end of the period", () => {
    expect(periodWindow("month", now, "calendar-current").to).toBe(now);
  });
});

describe("periodWindow — calendar-previous", () => {
  it("covers the last complete day", () => {
    expect(periodWindow("day", now, "calendar-previous")).toEqual({
      from: "2026-08-21T00:00:00.000Z",
      to: "2026-08-22T00:00:00.000Z",
    });
  });

  it("covers the last complete ISO week", () => {
    expect(periodWindow("week", now, "calendar-previous")).toEqual({
      from: "2026-08-10T00:00:00.000Z",
      to: "2026-08-17T00:00:00.000Z",
    });
  });

  it("covers the last complete month and year", () => {
    expect(periodWindow("month", now, "calendar-previous")).toEqual({
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    });
    expect(periodWindow("year", now, "calendar-previous")).toEqual({
      from: "2025-01-01T00:00:00.000Z",
      to: "2026-01-01T00:00:00.000Z",
    });
  });

  it("handles the January edge for months", () => {
    const january = instantOf("2026-01-10T12:00:00Z");
    expect(periodWindow("month", january, "calendar-previous")).toEqual({
      from: "2025-12-01T00:00:00.000Z",
      to: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("windowContains", () => {
  const window = periodWindow("day", now, "calendar-previous");

  it("is inclusive of the start and exclusive of the end", () => {
    expect(windowContains(window, instantOf("2026-08-21T00:00:00Z"))).toBe(true);
    expect(windowContains(window, instantOf("2026-08-21T23:59:59Z"))).toBe(true);
    expect(windowContains(window, instantOf("2026-08-22T00:00:00Z"))).toBe(false);
    expect(windowContains(window, instantOf("2026-08-20T23:59:59Z"))).toBe(false);
  });
});

describe("periodDays", () => {
  it("maps each period to an approximate length", () => {
    expect([periodDays("day"), periodDays("week"), periodDays("month"), periodDays("year")]).toEqual(
      [1, 7, 30, 365],
    );
  });
});
