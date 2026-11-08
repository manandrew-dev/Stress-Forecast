import { describe, expect, it } from "vitest";

import { todayLocal } from "@/lib/dates";

describe("todayLocal", () => {
  it("uses the local calendar day, even late in the evening", () => {
    // 11:30 pm local on Nov 7 is already Nov 8 in UTC for anyone west of UTC.
    expect(todayLocal(new Date(2026, 10, 7, 23, 30))).toBe("2026-11-07");
  });

  it("zero-pads month and day", () => {
    expect(todayLocal(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });
});
