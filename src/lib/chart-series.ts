import type { CohortDay } from "@/api/types";

export interface CohortChartPoint {
  x: number;
  date: string;
  /** null whenever the day is suppressed, so the line breaks instead of bridging the gap. */
  avg_stress: number | null;
  n_students: number | null;
  suppressed: boolean;
}

/**
 * Turn cohort days into chart points. A suppressed day never carries a value,
 * even if the API sent one, so the line can never be drawn across it.
 */
export function toCohortSeries(days: CohortDay[]): CohortChartPoint[] {
  return days.map((d, i) => ({
    x: i,
    date: d.date,
    avg_stress: d.suppressed ? null : d.avg_stress,
    n_students: d.suppressed ? null : d.n_students,
    suppressed: d.suppressed,
  }));
}

export interface SuppressedRange {
  startX: number;
  endX: number;
  startDate: string;
  endDate: string;
}

/** Group consecutive suppressed days into ranges so each gap gets one label. */
export function suppressedRanges(points: CohortChartPoint[]): SuppressedRange[] {
  const ranges: SuppressedRange[] = [];
  let current: SuppressedRange | null = null;
  for (const p of points) {
    if (p.suppressed) {
      if (current && current.endX === p.x - 1) {
        current.endX = p.x;
        current.endDate = p.date;
      } else {
        current = { startX: p.x, endX: p.x, startDate: p.date, endDate: p.date };
        ranges.push(current);
      }
    }
  }
  return ranges;
}
