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
