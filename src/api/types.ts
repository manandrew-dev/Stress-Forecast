// API contract types. Shapes match the backend spec exactly — do not rename fields.
// Dates are "YYYY-MM-DD"; timestamps are ISO 8601 with offset.

export type Role = "student" | "rep";
export type DeadlineType = "exam" | "midterm" | "quiz" | "assignment" | "project" | "other";

export const DEADLINE_TYPES: DeadlineType[] = [
  "exam",
  "midterm",
  "quiz",
  "assignment",
  "project",
  "other",
];

export interface Course {
  id: number;
  code: string;
  name: string;
  term: string;
}

export interface Deadline {
  id: number;
  course_id: number;
  title: string;
  due_date: string;
  weight_pct: number | null;
  type: DeadlineType;
}

/** A deadline before it is saved (no id / course_id yet). */
export interface DeadlineDraft {
  title: string;
  due_date: string;
  weight_pct: number | null;
  type: DeadlineType;
}

export interface MeResponse {
  id: string;
  role: Role;
  courses: Course[];
}

export interface CoursesResponse {
  courses: Course[];
}

export interface UpdateMyCoursesBody {
  course_ids: number[];
}

export interface SyllabusResponse {
  course_id: number;
  deadlines: DeadlineDraft[];
}

export interface SaveDeadlinesBody {
  course_id: number;
  deadlines: DeadlineDraft[];
}

export interface SaveDeadlinesResponse {
  deadlines: Deadline[];
}

export interface CheckinBody {
  text: string;
}

export interface CheckinResponse {
  time: string;
  stress: number;
  sleep_hours: number | null;
  causes: string[];
  concerning: boolean;
  replaced_earlier: boolean;
}

export interface TrendPoint {
  date: string;
  stress: number;
  sleep_hours: number | null;
}

export interface TrendResponse {
  points: TrendPoint[];
  deadlines: Deadline[];
}

export interface HeadsUpCollision {
  start: string;
  end: string;
  deadline_count: number;
  total_weight_pct: number;
  deadlines: Deadline[];
  message: string;
}

export interface HeadsUpResponse {
  collisions: HeadsUpCollision[];
}

export interface CohortDay {
  date: string;
  avg_stress: number | null;
  n_students: number | null;
  suppressed: boolean;
}

export interface CohortResponse {
  course: Course;
  min_students: number;
  days: CohortDay[];
  deadlines: Deadline[];
}

export interface CourseCollision {
  start: string;
  end: string;
  deadline_count: number;
  total_weight_pct: number;
  deadlines: Deadline[];
  peak_avg_stress: number | null;
  peak_date: string | null;
}

export interface CollisionsResponse {
  collisions: CourseCollision[];
}

export interface WeeklyReport {
  week_start: string;
  summary: string;
  top_cause: string;
  suggested_fix: string;
}

export interface Insight {
  week_start: string;
  finding: string;
}

export interface InsightsResponse {
  insights: Insight[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
