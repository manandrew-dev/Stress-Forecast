import type { Deadline } from "@/api/types";
import { addDays } from "@/lib/dates";

export const COLLISION_WINDOW_DAYS = 5;
export const COLLISION_MIN_COUNT = 2;
export const COLLISION_MIN_WEIGHT = 30;

export interface DetectedCollision {
  start: string;
  end: string;
  deadline_count: number;
  total_weight_pct: number;
  deadlines: Deadline[];
}

/**
 * Mock stand-in for the backend's collision detection: at least 2 deadlines
 * inside a 5-day window that together are worth at least 30% of grades.
 */
export function detectCollisions(deadlines: Deadline[]): DetectedCollision[] {
  const sorted = [...deadlines].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const out: DetectedCollision[] = [];
  let i = 0;
  while (i < sorted.length) {
    const anchor = sorted[i]!;
    const windowEnd = addDays(anchor.due_date, COLLISION_WINDOW_DAYS - 1);
    const group = sorted.slice(i).filter((d) => d.due_date <= windowEnd);
    const total = group.reduce((s, d) => s + (d.weight_pct ?? 0), 0);
    const last = group.at(-1) ?? anchor;
    if (group.length >= COLLISION_MIN_COUNT && total >= COLLISION_MIN_WEIGHT) {
      out.push({
        start: anchor.due_date,
        end: last.due_date,
        deadline_count: group.length,
        total_weight_pct: total,
        deadlines: group,
      });
      i += group.length;
    } else {
      i += 1;
    }
  }
  return out;
}
