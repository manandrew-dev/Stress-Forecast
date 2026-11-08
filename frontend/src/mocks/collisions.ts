// Mock-mode port of backend/app/services/collisions.py (docs/architecture.md §7).
// Keep the rules and constants identical to the backend (backend/app/config.py) so the
// highlighted collisions don't change on screen when VITE_USE_MOCKS is switched off.
import type { Deadline } from "@/api/types";
import { addDays } from "@/lib/dates";

export const COLLISION_MIN_COUNT = 3;
export const COLLISION_MIN_WEIGHT = 40;
export const COLLISION_WINDOW_DAYS = 5;
export const COLLISION_PEAK_LOOKBACK_DAYS = 3;
export const HEADS_UP_DAYS = 14;

export interface DetectedCollision {
  start: string;
  end: string;
  deadline_count: number;
  total_weight_pct: number;
  deadlines: Deadline[];
}

/** One non-suppressed day of cohort stress. */
export interface DailyStress {
  date: string;
  avg_stress: number;
}

/** Unknown (null) weights add 0, so the total is a lower bound when any weight is unknown. */
function knownWeight(deadlines: Deadline[]): number {
  return deadlines.reduce((s, d) => s + (d.weight_pct ?? 0), 0);
}

function isCollision(deadlines: Deadline[]): boolean {
  return deadlines.length >= COLLISION_MIN_COUNT || knownWeight(deadlines) >= COLLISION_MIN_WEIGHT;
}

/**
 * Merged collision windows, ordered by start date. Pass one course's deadlines for the
 * rep view, or every deadline across a student's courses for the heads-up.
 *
 * A collision is a COLLISION_WINDOW_DAYS-day window holding at least COLLISION_MIN_COUNT
 * assessments OR assessments worth at least COLLISION_MIN_WEIGHT percent combined.
 */
export function detectCollisions(deadlines: Deadline[]): DetectedCollision[] {
  const ordered = [...deadlines].sort(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id,
  );
  const inside = (start: string, end: string) =>
    ordered.filter((d) => d.due_date >= start && d.due_date <= end);

  // A window's contents only change when it starts on a deadline, so checking one window
  // per distinct due date covers every possible window.
  const flagged: [string, string][] = [];
  for (const start of [...new Set(ordered.map((d) => d.due_date))]) {
    const end = addDays(start, COLLISION_WINDOW_DAYS - 1);
    if (isCollision(inside(start, end))) flagged.push([start, end]);
  }

  const merged: [string, string][] = [];
  for (const [start, end] of flagged) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = end > last[1] ? end : last[1];
    else merged.push([start, end]);
  }

  return merged.map(([start, end]) => {
    const ds = inside(start, end);
    return {
      start,
      end,
      deadline_count: ds.length,
      total_weight_pct: knownWeight(ds),
      deadlines: ds,
    };
  });
}

/**
 * Collisions for one course, each with the nearby cohort stress peak. `daily` must hold only
 * non-suppressed days. The peak is searched from COLLISION_PEAK_LOOKBACK_DAYS before the
 * window to its end; ties go to the earliest day.
 */
export function repCollisions(
  deadlines: Deadline[],
  daily: DailyStress[],
): (DetectedCollision & { peak_avg_stress: number | null; peak_date: string | null })[] {
  return detectCollisions(deadlines).map((c) => {
    const from = addDays(c.start, -COLLISION_PEAK_LOOKBACK_DAYS);
    let peak: DailyStress | null = null;
    for (const day of daily) {
      if (day.date < from || day.date > c.end) continue;
      if (
        !peak ||
        day.avg_stress > peak.avg_stress ||
        (day.avg_stress === peak.avg_stress && day.date < peak.date)
      ) {
        peak = day;
      }
    }
    return { ...c, peak_avg_stress: peak?.avg_stress ?? null, peak_date: peak?.date ?? null };
  });
}

/** Collisions overlapping the next HEADS_UP_DAYS days (today included), with a message. */
export function headsUp(
  deadlines: Deadline[],
  today: string,
): (DetectedCollision & { message: string })[] {
  const horizonEnd = addDays(today, HEADS_UP_DAYS - 1);
  return detectCollisions(deadlines)
    .filter((c) => c.end >= today && c.start <= horizonEnd)
    .map((c) => ({ ...c, message: headsUpMessage(c) }));
}

/** Same wording as the backend template. The frontend shows `message` as a plain string. */
export function headsUpMessage(c: DetectedCollision): string {
  const days =
    Math.round(
      (Date.parse(`${c.end}T00:00:00Z`) - Date.parse(`${c.start}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  const noun = c.deadline_count === 1 ? "assessment" : "assessments";
  const weight = `${c.total_weight_pct}%`;
  const unknown = c.deadlines.some((d) => d.weight_pct === null);

  const summary =
    c.total_weight_pct === 0
      ? `${c.deadline_count} ${noun} in ${days} days.`
      : unknown
        ? `${c.deadline_count} ${noun} worth at least ${weight} in ${days} days.`
        : `${c.deadline_count} ${noun} worth ${weight} in ${days} days.`;

  // Heaviest item; ties go to the earliest due date.
  const heaviest = c.deadlines.reduce((best, d) => {
    const bw = best.weight_pct ?? 0;
    const dw = d.weight_pct ?? 0;
    return dw > bw || (dw === bw && d.due_date < best.due_date) ? d : best;
  });
  return `${summary} Start ${heaviest.title} early.`;
}
