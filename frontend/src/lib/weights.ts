import type { Deadline } from "@/api/types";

/** Each course's share of its own grade, in the order its first deadline is due. */
export function weightByCourse(
  deadlines: Deadline[],
): { courseId: number; weight: number | null }[] {
  const byCourse = new Map<number, number | null>();
  for (const d of [...deadlines].sort((a, b) => a.due_date.localeCompare(b.due_date))) {
    const prev = byCourse.get(d.course_id) ?? null;
    byCourse.set(d.course_id, d.weight_pct === null ? prev : (prev ?? 0) + d.weight_pct);
  }
  return [...byCourse.entries()].map(([courseId, weight]) => ({ courseId, weight }));
}

/**
 * Average of each course's total, e.g. ENGL 10% + 20% = 30% and PHYS 50%
 * average to 40%. Courses with no weights are left out; null if none have any.
 */
export function averageCourseWeight(deadlines: Deadline[]): number | null {
  const totals = weightByCourse(deadlines)
    .map((c) => c.weight)
    .filter((w): w is number => w !== null);
  if (totals.length === 0) return null;
  return Math.round(totals.reduce((sum, w) => sum + w, 0) / totals.length);
}
