import type { CohortDay, Deadline, TrendPoint } from "@/api/types";
import { addDays, dayRange, diffDays, parseDay } from "@/lib/dates";
import { COHORT_SIZE, MOCK_TODAY, SUPPRESSED_DAYS, TERM_START } from "./data";

/** Deterministic pseudo-random number in [0, 1) from a string seed. */
function noise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Deadline "load" on a day: stress ramps up over the 3 days before a deadline,
 * peaks on the day, and eases off the day after. Overlapping load compounds.
 */
function deadlineLoad(day: string, deadlines: Deadline[]): number {
  let load = 0;
  for (const d of deadlines) {
    const w = d.weight_pct ?? 3;
    const until = diffDays(d.due_date, day);
    if (until >= 0 && until <= 3) load += (w / 10) * (1 - until / 4);
    else if (until === -1) load += (w / 10) * 0.35;
  }
  return load + 0.12 * load * load;
}

function stressFor(day: string, deadlines: Deadline[], seed: string): number {
  const dow = parseDay(day).getUTCDay();
  const weekend = dow === 0 || dow === 6 ? -0.4 : 0;
  const drift = diffDays(day, TERM_START) * 0.012;
  const jitter = (noise(seed + day) - 0.5) * 0.9;
  const value = 2.8 + drift + weekend + jitter + deadlineLoad(day, deadlines);
  return Math.min(9.6, Math.max(1, round1(value)));
}

export function cohortDays(courseId: number, deadlines: Deadline[]): CohortDay[] {
  const size = COHORT_SIZE[courseId] ?? 30;
  return dayRange(TERM_START, MOCK_TODAY).map((date) => {
    if (SUPPRESSED_DAYS.has(date)) {
      return { date, avg_stress: null, n_students: null, suppressed: true };
    }
    const responders = Math.round(size * (0.35 + noise(`n${courseId}${date}`) * 0.4));
    return {
      date,
      avg_stress: stressFor(date, deadlines, `c${courseId}`),
      n_students: responders,
      suppressed: false,
    };
  });
}

export function studentTrend(deadlines: Deadline[], today: TrendPoint | null): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const date of dayRange(TERM_START, addDays(MOCK_TODAY, -1))) {
    // Students skip some days.
    if (noise(`skip${date}`) < 0.22) continue;
    const stress = Math.round(stressFor(date, deadlines, "me") + (noise(`me2${date}`) - 0.5));
    const clamped = Math.min(10, Math.max(1, stress));
    const sleep = noise(`sl${date}`) < 0.15 ? null : round1(8.2 - clamped * 0.35 + noise(`s${date}`));
    points.push({ date, stress: clamped, sleep_hours: sleep });
  }
  if (today) points.push(today);
  return points;
}
