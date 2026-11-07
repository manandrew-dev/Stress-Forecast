import type { Course, Deadline } from "@/api/types";

// One mock term. "Today" is pinned so the demo always tells the same story:
// week 9 (Nov 2–8) has just been hit by a 3-assessment, 55% pile-up.
export const TERM = "2026W1";
export const TERM_START = "2026-09-08";
export const TERM_END = "2026-12-18";
export const MOCK_TODAY = "2026-11-07";
export const MIN_STUDENTS = 5;

export const COURSES: Course[] = [
  { id: 1, code: "CPSC 210", name: "Software Construction", term: TERM },
  { id: 2, code: "MATH 200", name: "Calculus III", term: TERM },
  { id: 3, code: "PHYS 118", name: "Electricity, Light and Radiation", term: TERM },
  { id: 4, code: "ENGL 110", name: "Approaches to Literature", term: TERM },
];

/** Courses assigned to the mock class rep. */
export const REP_COURSE_IDS = [1, 2, 4];

export const COHORT_SIZE: Record<number, number> = { 1: 42, 2: 38, 3: 35, 4: 28 };

export const BASE_DEADLINES: Deadline[] = [
  // CPSC 210
  { id: 101, course_id: 1, title: "Quiz 1", due_date: "2026-09-22", weight_pct: 2, type: "quiz" },
  { id: 102, course_id: 1, title: "Project phase 1", due_date: "2026-09-29", weight_pct: 10, type: "project" },
  { id: 103, course_id: 1, title: "Midterm 1", due_date: "2026-10-06", weight_pct: 15, type: "midterm" },
  { id: 104, course_id: 1, title: "Quiz 2", due_date: "2026-10-20", weight_pct: 3, type: "quiz" },
  { id: 105, course_id: 1, title: "Midterm 2", due_date: "2026-11-03", weight_pct: 25, type: "midterm" },
  { id: 106, course_id: 1, title: "Project phase 2", due_date: "2026-11-18", weight_pct: 15, type: "project" },
  { id: 107, course_id: 1, title: "Final exam", due_date: "2026-12-10", weight_pct: 30, type: "exam" },
  // MATH 200
  { id: 201, course_id: 2, title: "WeBWorK 1", due_date: "2026-09-18", weight_pct: 2, type: "assignment" },
  { id: 202, course_id: 2, title: "WeBWorK 2", due_date: "2026-10-02", weight_pct: 2, type: "assignment" },
  { id: 203, course_id: 2, title: "Midterm 1", due_date: "2026-10-08", weight_pct: 20, type: "midterm" },
  { id: 204, course_id: 2, title: "WeBWorK 3", due_date: "2026-10-23", weight_pct: 2, type: "assignment" },
  { id: 205, course_id: 2, title: "Midterm 2", due_date: "2026-11-06", weight_pct: 20, type: "midterm" },
  { id: 206, course_id: 2, title: "WeBWorK 4", due_date: "2026-11-27", weight_pct: 4, type: "assignment" },
  { id: 207, course_id: 2, title: "Final exam", due_date: "2026-12-14", weight_pct: 50, type: "exam" },
  // PHYS 118
  { id: 301, course_id: 3, title: "Lab 1", due_date: "2026-09-25", weight_pct: 5, type: "assignment" },
  { id: 302, course_id: 3, title: "Lab 2", due_date: "2026-10-16", weight_pct: 5, type: "assignment" },
  { id: 303, course_id: 3, title: "Midterm", due_date: "2026-10-21", weight_pct: 20, type: "midterm" },
  { id: 304, course_id: 3, title: "Circuits project", due_date: "2026-11-04", weight_pct: 10, type: "project" },
  { id: 305, course_id: 3, title: "Lab 3", due_date: "2026-11-20", weight_pct: 5, type: "assignment" },
  { id: 306, course_id: 3, title: "Clicker participation", due_date: "2026-12-04", weight_pct: null, type: "other" },
  { id: 307, course_id: 3, title: "Final exam", due_date: "2026-12-12", weight_pct: 45, type: "exam" },
  // ENGL 110
  { id: 401, course_id: 4, title: "Reading response 1", due_date: "2026-09-24", weight_pct: 5, type: "assignment" },
  { id: 402, course_id: 4, title: "Essay 1", due_date: "2026-10-16", weight_pct: 15, type: "assignment" },
  { id: 403, course_id: 4, title: "Essay 2", due_date: "2026-11-16", weight_pct: 20, type: "assignment" },
  { id: 404, course_id: 4, title: "Reading response 2", due_date: "2026-11-25", weight_pct: 5, type: "assignment" },
  { id: 405, course_id: 4, title: "Seminar participation", due_date: "2026-12-04", weight_pct: null, type: "other" },
  { id: 406, course_id: 4, title: "Final exam", due_date: "2026-12-16", weight_pct: 30, type: "exam" },
];

/** Days with too few check-ins to show (e.g. Thanksgiving weekend). */
export const SUPPRESSED_DAYS = new Set([
  "2026-09-13",
  "2026-09-27",
  "2026-10-11",
  "2026-10-12",
  "2026-10-25",
]);

/** What the syllabus parser "finds" per course in mock mode. */
export const SYLLABUS_EXTRACTS: Record<number, Omit<Deadline, "id" | "course_id">[]> = Object.fromEntries(
  COURSES.map((c) => [
    c.id,
    BASE_DEADLINES.filter((d) => d.course_id === c.id).map(({ title, due_date, weight_pct, type }) => ({
      title,
      due_date,
      weight_pct,
      type,
    })),
  ]),
);

export const INSIGHTS: Record<number, { week_start: string; finding: string }[]> = {
  1: [
    {
      week_start: "2026-11-02",
      finding:
        "Average stress hit 8.1 on Nov 3, the highest this term — the CPSC 210 midterm landed in the same 4 days as the PHYS 118 project and MATH 200 Midterm 2.",
    },
    {
      week_start: "2026-10-05",
      finding:
        "Stress climbed 2 days before CPSC 210 Midterm 1 and stayed high until MATH 200 Midterm 1 two days later.",
    },
    {
      week_start: "2026-09-28",
      finding: "Project phase 1 caused a small bump; most students mentioned unclear requirements.",
    },
  ],
  2: [
    {
      week_start: "2026-11-02",
      finding:
        "MATH 200 Midterm 2 came 3 days after CPSC 210 Midterm 2. Students who take both reported 2 fewer hours of sleep.",
    },
    {
      week_start: "2026-10-05",
      finding: "Midterm 1 overlapped with CPSC 210 Midterm 1; stress stayed above 6 for 4 days.",
    },
  ],
  3: [],
  4: [],
};
