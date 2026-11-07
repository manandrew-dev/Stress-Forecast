import { describe, expect, it } from "vitest";

import type { CohortDay, Deadline } from "@/api/types";
import { fillTimeline, suppressedRanges, toCohortSeries } from "@/lib/chart-series";
import { detectCollisions } from "@/mocks/collisions";
import { BASE_DEADLINES } from "@/mocks/data";

const day = (date: string, avg: number | null, suppressed = false): CohortDay => ({
  date,
  avg_stress: avg,
  n_students: suppressed ? null : 12,
  suppressed,
});

describe("cohort chart gaps", () => {
  it("never carries a value on a suppressed day, even if the API sent one", () => {
    const series = toCohortSeries([day("2026-10-10", 4), day("2026-10-11", 6.2, true), day("2026-10-12", 5)]);
    expect(series.map((p) => p.value)).toEqual([4, null, 5]);
  });

  it("keeps suppressed days empty after filling the timeline", () => {
    const series = toCohortSeries([day("2026-10-10", 4), day("2026-10-11", 6.2, true), day("2026-10-12", 5)]);
    const rows = fillTimeline(series, "2026-10-10", "2026-10-14");
    expect(rows[1]).toMatchObject({ date: "2026-10-11", value: null, suppressed: true });
  });

  it("groups consecutive suppressed days into one labelled gap", () => {
    const series = toCohortSeries([
      day("2026-10-10", 4),
      day("2026-10-11", null, true),
      day("2026-10-12", null, true),
      day("2026-10-13", 5),
      day("2026-10-14", null, true),
    ]);
    expect(suppressedRanges(series)).toEqual([
      { startX: 1, endX: 2, startDate: "2026-10-11", endDate: "2026-10-12" },
      { startX: 4, endX: 4, startDate: "2026-10-14", endDate: "2026-10-14" },
    ]);
  });
});

describe("mock data story", () => {
  it("has a week 9 pile-up of 3 assessments worth 55% within 5 days", () => {
    const week9 = detectCollisions(BASE_DEADLINES).find((c) => c.start >= "2026-11-02" && c.start <= "2026-11-08");
    expect(week9).toMatchObject({ deadline_count: 3, total_weight_pct: 55 });
  });

  it("does not flag two small deadlines as a pile-up", () => {
    const small: Deadline[] = [
      { id: 1, course_id: 1, title: "Quiz", due_date: "2026-10-01", weight_pct: 2, type: "quiz" },
      { id: 2, course_id: 2, title: "Lab", due_date: "2026-10-02", weight_pct: 5, type: "assignment" },
    ];
    expect(detectCollisions(small)).toEqual([]);
  });
});
