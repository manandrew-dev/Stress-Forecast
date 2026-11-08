// Port of db/seed.py's generate_checkins(): 40 students (index 0 is the demo student),
// the same enrolment patterns, deadline-load curve, skip rate and low-response day, so
// mock charts have the same shape as the seeded database. The random stream differs from
// Python's, so individual values differ slightly; averages and spikes line up.
import type { CohortDay, Deadline, TrendPoint } from "@/api/types";
import { addDays, dayRange, diffDays } from "@/lib/dates";
import { COURSES, DEMO_STUDENT_COURSE_IDS, MIN_STUDENTS, MOCK_TODAY, TERM_START } from "./data";

const STUDENT_COUNT = 40;
/** Only 4 students check in that day, so every course is suppressed (< MIN_STUDENTS). */
const LOW_RESPONSE_DAY = "2026-09-13";
const SKIP_RATE = 0.16;
/** Indexes into COURSES, cycled over the students (seed's _ENROLLMENT_PATTERNS). */
const ENROLLMENT_PATTERNS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
  [0, 1, 2],
  [0, 2, 3],
];
/** Days before a deadline → share of its load (seed's _DEADLINE_LOAD). */
const DEADLINE_LOAD: Record<number, number> = { 3: 0.45, 2: 0.75, 1: 1.0, 0: 0.7 };

interface SimCheckin {
  date: string;
  stress: number;
  sleep_hours: number | null;
}

interface SimStudent {
  courseIds: number[];
  checkins: SimCheckin[];
}

/** Each fake student's course ids, in seed order (index 0 is the demo student). */
export function studentCourseIds(demoStudentCourses: number[]): number[][] {
  return Array.from({ length: STUDENT_COUNT }, (_, index) =>
    index === 0
      ? demoStudentCourses
      : ENROLLMENT_PATTERNS[index % ENROLLMENT_PATTERNS.length]!.map((i) => COURSES[i]!.id),
  );
}

/** Small deterministic PRNG (mulberry32), seeded like the Python fixture. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Simulates the first `count` students from TERM_START up to (not including) MOCK_TODAY.
 * Draws happen in the same order as the seed, so student 0's history doesn't depend on
 * how many students are simulated or which courses they take.
 */
function simulate(
  deadlines: Deadline[],
  demoStudentCourses: number[],
  count = STUDENT_COUNT,
): SimStudent[] {
  const rng = mulberry32(2026);
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * rng();
  const days = dayRange(TERM_START, addDays(MOCK_TODAY, -1));
  const students: SimStudent[] = [];
  const enrolments = studentCourseIds(demoStudentCourses);

  for (let index = 0; index < count; index++) {
    const courseIds = enrolments[index]!;
    const mine = deadlines.filter((d) => courseIds.includes(d.course_id));
    const baseline = uniform(2.5, 4.1);
    const sensitivity = uniform(0.8, 1.2);
    const checkins: SimCheckin[] = [];

    for (const date of days) {
      if (date === LOW_RESPONSE_DAY) {
        if (index >= MIN_STUDENTS - 1) continue;
      } else if (index > 0 && rng() < SKIP_RATE) {
        continue;
      }
      const load = mine.reduce(
        (sum, d) =>
          sum + ((d.weight_pct ?? 0) / 8) * (DEADLINE_LOAD[diffDays(d.due_date, date)] ?? 0),
        0,
      );
      const stress = Math.min(
        10,
        Math.max(1, Math.round(baseline + sensitivity * load + uniform(-0.65, 0.65))),
      );
      const sleep_hours = rng() < 0.1 ? null : round1(8.8 - stress * 0.35 + uniform(-0.5, 0.5));
      checkins.push({ date, stress, sleep_hours });
    }
    students.push({ courseIds, checkins });
  }
  return students;
}

/**
 * Daily cohort stress for one course, like the daily_course_stress aggregate: the average over
 * enrolled students who checked in that day, suppressed when fewer than MIN_STUDENTS did.
 */
export function cohortDays(
  courseId: number,
  deadlines: Deadline[],
  demoStudentCourses: number[] = DEMO_STUDENT_COURSE_IDS,
): CohortDay[] {
  const byDay = new Map<string, number[]>();
  for (const s of simulate(deadlines, demoStudentCourses)) {
    if (!s.courseIds.includes(courseId)) continue;
    for (const c of s.checkins) {
      const list = byDay.get(c.date) ?? [];
      list.push(c.stress);
      byDay.set(c.date, list);
    }
  }
  return dayRange(TERM_START, addDays(MOCK_TODAY, -1)).map((date) => {
    const values = byDay.get(date) ?? [];
    if (values.length < MIN_STUDENTS) {
      return { date, avg_stress: null, n_students: null, suppressed: true };
    }
    return {
      date,
      avg_stress: round2(values.reduce((a, b) => a + b, 0) / values.length),
      n_students: values.length,
      suppressed: false,
    };
  });
}

/** The demo student's own history (seed student 0: checks in every day), plus today's check-in. */
export function studentTrend(deadlines: Deadline[], today: TrendPoint | null): TrendPoint[] {
  const courseIds = [...new Set(deadlines.map((d) => d.course_id))];
  const [me] = simulate(deadlines, courseIds, 1);
  const points: TrendPoint[] = (me?.checkins ?? []).map((c) => ({ ...c }));
  if (today) points.push(today);
  return points;
}
