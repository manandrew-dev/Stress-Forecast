import type { Course, Deadline } from "@/api/types";

// Mirrors db/seed.py so screens look the same with VITE_USE_MOCKS on or off:
// same courses, deadlines, enrolments and rep assignments. "Today" is the seed's DEMO_DAY;
// week 9 (Nov 2–8) has just been hit by a 3-assessment, 55% pile-up inside DEMO CPSC 210.
export const TERM = "2026W1";
export const TERM_START = "2026-09-08";
export const TERM_END = "2026-12-18";
export const MOCK_TODAY = "2026-11-07";
export const MIN_STUDENTS = 5;

/** Seed insertion order, so ids match a freshly seeded database. */
export const COURSES: Course[] = [
  { id: 1, code: "DEMO CPSC 210", name: "Software Construction", term: TERM },
  { id: 2, code: "DEMO MATH 200", name: "Calculus III", term: TERM },
  { id: 3, code: "DEMO PHYS 118", name: "Electricity, Light and Radiation", term: TERM },
  { id: 4, code: "DEMO ENGL 110", name: "Approaches to Literature", term: TERM },
];

/** Courses assigned to the demo rep (seed: CPSC 210, MATH 200, ENGL 110). */
export const REP_COURSE_IDS = [1, 2, 4];

/** Courses the demo student is enrolled in (seed: enrolment pattern 0 = CPSC 210 + MATH 200). */
export const DEMO_STUDENT_COURSE_IDS = [1, 2];

/** db/seed.py ASSESSMENTS, in insertion order (ids 1–18 on a fresh database). */
export const BASE_DEADLINES: Deadline[] = [
  // DEMO CPSC 210 (week 9: Midterm 2 + Project Phase 3 + Quiz 4 = 55% in 5 days)
  {
    id: 1,
    course_id: 1,
    title: "Project Phase 1",
    due_date: "2026-09-29",
    weight_pct: 10,
    type: "project",
  },
  {
    id: 2,
    course_id: 1,
    title: "Midterm 1",
    due_date: "2026-10-06",
    weight_pct: 15,
    type: "midterm",
  },
  {
    id: 3,
    course_id: 1,
    title: "Midterm 2",
    due_date: "2026-11-03",
    weight_pct: 20,
    type: "midterm",
  },
  {
    id: 4,
    course_id: 1,
    title: "Project Phase 3",
    due_date: "2026-11-05",
    weight_pct: 25,
    type: "project",
  },
  { id: 5, course_id: 1, title: "Quiz 4", due_date: "2026-11-07", weight_pct: 10, type: "quiz" },
  {
    id: 6,
    course_id: 1,
    title: "Final Exam",
    due_date: "2026-12-10",
    weight_pct: 20,
    type: "exam",
  },
  // DEMO MATH 200
  {
    id: 7,
    course_id: 2,
    title: "Problem Set 1",
    due_date: "2026-09-18",
    weight_pct: 10,
    type: "assignment",
  },
  {
    id: 8,
    course_id: 2,
    title: "Midterm 1",
    due_date: "2026-10-08",
    weight_pct: 25,
    type: "midterm",
  },
  {
    id: 9,
    course_id: 2,
    title: "Midterm 2",
    due_date: "2026-11-19",
    weight_pct: 25,
    type: "midterm",
  },
  {
    id: 10,
    course_id: 2,
    title: "Final Exam",
    due_date: "2026-12-14",
    weight_pct: 40,
    type: "exam",
  },
  // DEMO PHYS 118
  {
    id: 11,
    course_id: 3,
    title: "Lab Report 1",
    due_date: "2026-09-25",
    weight_pct: 15,
    type: "assignment",
  },
  {
    id: 12,
    course_id: 3,
    title: "Midterm",
    due_date: "2026-10-21",
    weight_pct: 25,
    type: "midterm",
  },
  {
    id: 13,
    course_id: 3,
    title: "Circuits Project",
    due_date: "2026-11-23",
    weight_pct: 25,
    type: "project",
  },
  {
    id: 14,
    course_id: 3,
    title: "Final Exam",
    due_date: "2026-12-12",
    weight_pct: 35,
    type: "exam",
  },
  // DEMO ENGL 110
  {
    id: 15,
    course_id: 4,
    title: "Reading Response",
    due_date: "2026-09-24",
    weight_pct: 10,
    type: "assignment",
  },
  {
    id: 16,
    course_id: 4,
    title: "Close Reading Essay",
    due_date: "2026-10-15",
    weight_pct: 30,
    type: "assignment",
  },
  {
    id: 17,
    course_id: 4,
    title: "Research Proposal",
    due_date: "2026-11-16",
    weight_pct: 20,
    type: "assignment",
  },
  {
    id: 18,
    course_id: 4,
    title: "Research Essay",
    due_date: "2026-12-04",
    weight_pct: 40,
    type: "assignment",
  },
];

/** What the syllabus parser "finds" per course in mock mode. */
export const SYLLABUS_EXTRACTS: Record<number, Omit<Deadline, "id" | "course_id">[]> =
  Object.fromEntries(
    COURSES.map((c) => [
      c.id,
      BASE_DEADLINES.filter((d) => d.course_id === c.id).map(
        ({ title, due_date, weight_pct, type }) => ({
          title,
          due_date,
          weight_pct,
          type,
        }),
      ),
    ]),
  );

// Only findings the Databricks notebook (#22) can produce: it sees non-suppressed daily
// averages (n_students >= 5) and deadlines. No check-in text, causes, sleep, or per-student
// course combinations.
export const INSIGHTS: Record<number, { week_start: string; finding: string }[]> = {
  1: [
    {
      week_start: "2026-11-02",
      finding:
        "Midterm 2, Project Phase 3 and Quiz 4 (55% combined) fell within 5 days, and average stress reached its highest level of the term so far.",
    },
    {
      week_start: "2026-10-05",
      finding: "Average stress rose in the 3 days before Midterm 1 (15%) and eased after it.",
    },
    {
      week_start: "2026-09-28",
      finding: "Project Phase 1 (10%) came with only a small rise in average stress.",
    },
  ],
  2: [
    {
      week_start: "2026-10-05",
      finding:
        "Average stress rose in the 3 days before Midterm 1 (25%), the course’s heaviest assessment so far.",
    },
  ],
  3: [],
  4: [],
};
