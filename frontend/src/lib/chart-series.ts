import type { CohortDay, Deadline, TrendPoint } from "@/api/types";
import { dayRange, diffDays, parseDay } from "./dates";

export interface CohortChartPoint {
  x: number;
  date: string;
  /** null whenever the day is suppressed, so the line breaks instead of bridging the gap. */
  value: number | null;
  n_students: number | null;
  suppressed: boolean;
}

/**
 * Turn cohort days into chart points. A suppressed day never carries a value,
 * even if the API sent one, so the line can never be drawn across it.
 */
export function toCohortSeries(days: CohortDay[], origin: string = days[0]?.date ?? ""): CohortChartPoint[] {
  return days.map((d) => ({
    x: diffDays(d.date, origin),
    date: d.date,
    value: d.suppressed ? null : d.avg_stress,
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
    if (!p.suppressed) continue;
    if (current && current.endX === p.x - 1) {
      current.endX = p.x;
      current.endDate = p.date;
    } else {
      current = { startX: p.x, endX: p.x, startDate: p.date, endDate: p.date };
      ranges.push(current);
    }
  }
  return ranges;
}

export interface TimelineRow {
  x: number;
  date: string;
  value: number | null;
  n_students?: number | null;
  sleep_hours?: number | null;
  suppressed: boolean;
  /** true for days after the last data point */
  future: boolean;
}

/** Fill every day between origin and end so the chart has one slot per calendar day. */
export function fillTimeline(
  points: { date: string; value: number | null; n_students?: number | null; sleep_hours?: number | null; suppressed?: boolean }[],
  origin: string,
  end: string,
): TimelineRow[] {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const lastDataDate = points.at(-1)?.date ?? origin;
  return dayRange(origin, end).map((date) => {
    const p = byDate.get(date);
    return {
      x: diffDays(date, origin),
      date,
      value: p?.suppressed ? null : (p?.value ?? null),
      n_students: p?.n_students ?? null,
      sleep_hours: p?.sleep_hours ?? null,
      suppressed: p?.suppressed ?? false,
      future: date > lastDataDate,
    };
  });
}

export function trendToPoints(points: TrendPoint[]) {
  return points.map((p) => ({ date: p.date, value: p.stress, sleep_hours: p.sleep_hours }));
}

export interface DeadlineMark {
  x: number;
  date: string;
  deadlines: Deadline[];
  totalWeight: number;
}

/** One marker per day, combining every deadline due that day. */
export function deadlineMarks(deadlines: Deadline[], origin: string, end: string): DeadlineMark[] {
  const byDate = new Map<string, Deadline[]>();
  for (const d of deadlines) {
    if (d.due_date < origin || d.due_date > end) continue;
    byDate.set(d.due_date, [...(byDate.get(d.due_date) ?? []), d]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      x: diffDays(date, origin),
      date,
      deadlines: list,
      totalWeight: list.reduce((s, d) => s + (d.weight_pct ?? 0), 0),
    }));
}

/** x positions of every Monday, for weekly axis ticks. */
export function mondayTicks(origin: string, end: string): number[] {
  return dayRange(origin, end)
    .filter((d) => parseDay(d).getUTCDay() === 1)
    .map((d) => diffDays(d, origin));
}
