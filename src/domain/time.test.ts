import { describe, expect, it } from "vitest";
import { addDaysKey, currentStreak, localDateKey, longestStreak, startOfLocalDay } from "./time";

describe("date locali", () => {
  it("usa il fuso dell'utente", () => {
    const d = new Date("2026-11-05T23:30:00Z");
    expect(localDateKey(d, "Europe/Rome")).toBe("2026-11-06");
    expect(localDateKey(d, "UTC")).toBe("2026-11-05");
  });
  it("mezzanotte locale", () => {
    expect(startOfLocalDay(new Date("2026-11-05T10:00:00Z"), "Europe/Rome").toISOString()).toBe("2026-11-04T23:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-07-05T10:00:00Z"), "Europe/Rome").toISOString()).toBe("2026-07-04T22:00:00.000Z");
  });
  it("addDaysKey attraversa mesi e anni", () => {
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("streak", () => {
  const days = new Set(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05"]);
  it("conta fino a oggi o ieri", () => {
    expect(currentStreak(days, "2026-11-05")).toBe(1);
    expect(currentStreak(days, "2026-11-04")).toBe(3);
    expect(currentStreak(days, "2026-11-07")).toBe(0);
  });
  it("serie più lunga", () => {
    expect(longestStreak(days)).toBe(3);
    expect(longestStreak(new Set())).toBe(0);
  });
});
