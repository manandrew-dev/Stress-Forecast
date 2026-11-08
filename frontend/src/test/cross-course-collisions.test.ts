import { describe, expect, it } from "vitest";

import type { Deadline } from "@/api/types";
import { crossCourseRepCollisions, sharedCourseIds } from "@/mocks/collisions";

// Course 1 is the rep's course. Five students per combination.
const students = [
  ...Array(5).fill([1, 2]),
  ...Array(5).fill([1, 3]),
  ...Array(4).fill([1, 4]),
  ...Array(5).fill([2, 3]),
] as number[][];

let nextId = 1;
const d = (course_id: number, due_date: string, weight_pct: number): Deadline => ({
  id: nextId++,
  course_id,
  title: `C${course_id} ${due_date}`,
  due_date,
  weight_pct,
  type: "midterm",
});

describe("sharedCourseIds", () => {
  it("keeps other courses at least the minimum of the class also takes", () => {
    // Course 4 has only 4 of course 1's students, so it isn't shared.
    expect(sharedCourseIds(1, students, 5)).toEqual([2, 3]);
  });
});

describe("crossCourseRepCollisions", () => {
  it("finds a pile-up across shared courses and counts who it affects", () => {
    const deadlines = [d(1, "2026-11-03", 20), d(2, "2026-11-05", 25)];
    const [c, ...rest] = crossCourseRepCollisions(1, deadlines, students, [], 5);
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ deadline_count: 2, total_weight_pct: 45, students_affected: 5 });
  });

  it("drops pile-ups that have none of this course's deadlines", () => {
    const deadlines = [d(1, "2026-10-01", 10), d(2, "2026-11-05", 25), d(3, "2026-11-06", 25)];
    expect(crossCourseRepCollisions(1, deadlines, students, [], 5)).toEqual([]);
  });

  it("leaves out courses that aren't shared", () => {
    // Only 4 of the class take course 4, so its exam can't make a pile-up here.
    const deadlines = [d(1, "2026-11-03", 20), d(4, "2026-11-04", 30)];
    expect(crossCourseRepCollisions(1, deadlines, students, [], 5)).toEqual([]);
  });

  it("hides pile-ups that affect fewer students than the minimum", () => {
    const deadlines = [d(1, "2026-11-03", 20), d(2, "2026-11-05", 25)];
    expect(crossCourseRepCollisions(1, deadlines, students, [], 6)).toEqual([]);
  });

  it("counts everyone in the class for a pile-up inside the course itself", () => {
    const deadlines = [d(1, "2026-11-03", 20), d(1, "2026-11-05", 25)];
    expect(crossCourseRepCollisions(1, deadlines, students, [], 5)[0]?.students_affected).toBe(14);
  });
});
