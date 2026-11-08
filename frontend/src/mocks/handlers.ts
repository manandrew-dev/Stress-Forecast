// Mock implementations of every endpoint. Return values use the exact API shapes.
import { ApiError } from "@/api/errors";
import { DEADLINE_TYPES } from "@/api/types";
import type {
  CheckinResponse,
  CohortResponse,
  CollisionsResponse,
  CoursesResponse,
  DateRange,
  Deadline,
  DeadlineDraft,
  HeadsUpResponse,
  InsightsResponse,
  MeResponse,
  Role,
  SaveDeadlinesResponse,
  SyllabusResponse,
  TrendResponse,
  WeeklyReport,
} from "@/api/types";
import type { AuthUser } from "@/auth/session";
import { addDays, diffDays, longDate, rangeLabel, shortDate, weekStartOf } from "@/lib/dates";
import { analyzeCheckin } from "./checkin";
import { detectCollisions, headsUp, repCollisions } from "./collisions";
import {
  BASE_DEADLINES,
  COURSES,
  INSIGHTS,
  MIN_STUDENTS,
  MOCK_TODAY,
  REP_COURSE_IDS,
  SYLLABUS_EXTRACTS,
} from "./data";
import { cohortDays, studentTrend } from "./generate";
import { getState, setState } from "./store";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => sleep(350 + Math.random() * 350);

function requireUser(user: AuthUser | null, role?: Role): AuthUser {
  if (!user) throw new ApiError("unauthorized", "Please log in.", 401);
  if (role && user.role !== role)
    throw new ApiError("forbidden", "You don't have access to this.", 403);
  return user;
}

function courseById(id: number) {
  const c = COURSES.find((x) => x.id === id);
  if (!c) throw new ApiError("not_found", "Course not found.", 404);
  return c;
}

function requireRepCourse(user: AuthUser | null, id: number) {
  requireUser(user, "rep");
  const course = courseById(id);
  if (!REP_COURSE_IDS.includes(id))
    throw new ApiError("forbidden", "You're not the rep for this course.", 403);
  return course;
}

function allDeadlines(): Deadline[] {
  return [...BASE_DEADLINES, ...getState().extraDeadlines];
}

function enrolledDeadlines(): Deadline[] {
  const ids = getState().enrolledCourseIds;
  return allDeadlines().filter((d) => ids.includes(d.course_id));
}

/** One course's deadlines: what the backend uses for every rep endpoint (architecture.md §7). */
function courseDeadlines(courseId: number): Deadline[] {
  return allDeadlines().filter((d) => d.course_id === courseId);
}

function courseCode(id: number) {
  return COURSES.find((c) => c.id === id)?.code ?? "Course";
}

// ---------- shared ----------

export async function getMe(user: AuthUser | null): Promise<MeResponse> {
  await latency();
  const u = requireUser(user);
  const ids = u.role === "rep" ? REP_COURSE_IDS : getState().enrolledCourseIds;
  return { id: u.id, role: u.role, courses: COURSES.filter((c) => ids.includes(c.id)) };
}

export async function getCourses(user: AuthUser | null): Promise<CoursesResponse> {
  await latency();
  requireUser(user);
  return { courses: COURSES };
}

// ---------- student ----------

export async function putMyCourses(user: AuthUser | null, course_ids: number[]): Promise<void> {
  await latency();
  requireUser(user, "student");
  course_ids.forEach(courseById);
  setState({ enrolledCourseIds: [...new Set(course_ids)] });
}

export async function postSyllabus(
  user: AuthUser | null,
  input: { course_id: number; text?: string; file?: File },
): Promise<SyllabusResponse> {
  requireUser(user, "student");
  courseById(input.course_id);
  if (
    input.file &&
    input.file.type !== "application/pdf" &&
    !input.file.name.toLowerCase().endsWith(".pdf")
  ) {
    throw new ApiError("bad_request", "Please upload a PDF file.", 400);
  }
  if (!input.file && !input.text?.trim()) {
    throw new ApiError("bad_request", "Paste some syllabus text or upload a PDF.", 400);
  }
  // Real parsing can take ~15s; keep the mock shorter but long enough to see the loading state.
  await sleep(6000);
  return { course_id: input.course_id, deadlines: SYLLABUS_EXTRACTS[input.course_id] ?? [] };
}

export async function postDeadlines(
  user: AuthUser | null,
  body: { course_id: number; deadlines: DeadlineDraft[] },
): Promise<SaveDeadlinesResponse> {
  await latency();
  requireUser(user, "student");
  courseById(body.course_id);
  body.deadlines.forEach(validateDraft);
  const state = getState();
  // Replace semantics (docs/api.md): drop this student's earlier deadlines for the course.
  // In the mock, extraDeadlines are all created by the demo student; BASE_DEADLINES are seed data.
  const kept = state.extraDeadlines.filter((e) => e.course_id !== body.course_id);
  let nextId = state.nextDeadlineId;
  const saved: Deadline[] = [];
  const added: Deadline[] = [];
  for (const d of body.deadlines) {
    // Mock-only: reuse a matching seeded deadline so the demo timeline doesn't show duplicates.
    const seeded = BASE_DEADLINES.find(
      (e) => e.course_id === body.course_id && e.title === d.title && e.due_date === d.due_date,
    );
    if (seeded) {
      saved.push(seeded);
    } else {
      const created: Deadline = { id: nextId++, course_id: body.course_id, ...d };
      saved.push(created);
      added.push(created);
    }
  }
  setState({ extraDeadlines: [...kept, ...added], nextDeadlineId: nextId });
  return { deadlines: saved };
}

function validateDraft(d: DeadlineDraft): void {
  if (!d.title?.trim()) throw new ApiError("bad_request", "Every deadline needs a title.", 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.due_date ?? "")) {
    throw new ApiError("bad_request", "Due dates must be YYYY-MM-DD.", 400);
  }
  if (!DEADLINE_TYPES.includes(d.type))
    throw new ApiError("bad_request", "Unknown deadline type.", 400);
  if (
    d.weight_pct !== null &&
    (typeof d.weight_pct !== "number" || d.weight_pct < 0 || d.weight_pct > 100)
  ) {
    throw new ApiError("bad_request", "Weight must be between 0 and 100.", 400);
  }
}

/** Deadlines the demo student created and may edit; seeded ones belong to someone else. */
function ownDeadline(id: number): Deadline {
  const own = getState().extraDeadlines.find((d) => d.id === id);
  if (own) return own;
  if (BASE_DEADLINES.some((d) => d.id === id)) {
    throw new ApiError("forbidden", "You can only change deadlines you added.", 403);
  }
  throw new ApiError("not_found", "Deadline not found.", 404);
}

export async function putDeadline(
  user: AuthUser | null,
  id: number,
  draft: DeadlineDraft,
): Promise<Deadline> {
  await latency();
  requireUser(user, "student");
  const current = ownDeadline(id);
  validateDraft(draft);
  const updated: Deadline = {
    id: current.id,
    course_id: current.course_id,
    title: draft.title,
    due_date: draft.due_date,
    weight_pct: draft.weight_pct,
    type: draft.type,
  };
  setState({ extraDeadlines: getState().extraDeadlines.map((d) => (d.id === id ? updated : d)) });
  return updated;
}

export async function deleteDeadline(user: AuthUser | null, id: number): Promise<void> {
  await latency();
  requireUser(user, "student");
  ownDeadline(id);
  setState({ extraDeadlines: getState().extraDeadlines.filter((d) => d.id !== id) });
}

function inRange(date: string, range: DateRange): boolean {
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function isoNowOn(day: string): string {
  const now = new Date();
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${day}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export async function postCheckin(user: AuthUser | null, text: string): Promise<CheckinResponse> {
  await sleep(1200);
  requireUser(user, "student");
  if (!text.trim())
    throw new ApiError("bad_request", "Tell us a little about your day first.", 400);
  const result = analyzeCheckin(text);
  const replaced_earlier = getState().todayCheckin !== null;
  setState({
    todayCheckin: { date: MOCK_TODAY, stress: result.stress, sleep_hours: result.sleep_hours },
  });
  return { time: isoNowOn(MOCK_TODAY), ...result, replaced_earlier };
}

export async function getMyTrend(
  user: AuthUser | null,
  range: DateRange = {},
): Promise<TrendResponse> {
  await latency();
  requireUser(user, "student");
  const deadlines = enrolledDeadlines();
  return {
    points: studentTrend(deadlines, getState().todayCheckin).filter((p) => inRange(p.date, range)),
    deadlines: deadlines.filter((d) => inRange(d.due_date, range)),
  };
}

export async function getHeadsUp(user: AuthUser | null): Promise<HeadsUpResponse> {
  await latency();
  requireUser(user, "student");
  return { collisions: headsUp(enrolledDeadlines(), MOCK_TODAY) };
}

// ---------- rep ----------

export async function getCohort(
  user: AuthUser | null,
  courseId: number,
  range: DateRange = {},
): Promise<CohortResponse> {
  await latency();
  const course = requireRepCourse(user, courseId);
  return {
    course,
    min_students: MIN_STUDENTS,
    // Stress is simulated from every deadline (students take several courses),
    // but the response lists only this course's deadlines, like the backend.
    days: cohortDays(courseId, allDeadlines(), getState().enrolledCourseIds).filter((d) =>
      inRange(d.date, range),
    ),
    deadlines: courseDeadlines(courseId).filter((d) => inRange(d.due_date, range)),
  };
}

function collisionsFor(courseId: number) {
  const daily = cohortDays(courseId, allDeadlines(), getState().enrolledCourseIds).flatMap((d) =>
    !d.suppressed && d.avg_stress !== null ? [{ date: d.date, avg_stress: d.avg_stress }] : [],
  );
  return repCollisions(courseDeadlines(courseId), daily);
}

export async function getCollisions(
  user: AuthUser | null,
  courseId: number,
): Promise<CollisionsResponse> {
  await latency();
  requireRepCourse(user, courseId);
  return { collisions: collisionsFor(courseId) };
}

/** Find a shift (in days) that takes `target` out of every collision. */
function suggestShift(target: Deadline): number | null {
  const others = courseDeadlines(target.course_id).filter((d) => d.id !== target.id);
  for (const shift of [-7, 7, -14, 14]) {
    const moved = { ...target, due_date: addDays(target.due_date, shift) };
    const hit = detectCollisions([...others, moved]).some((c) =>
      c.deadlines.some((d) => d.id === target.id),
    );
    if (!hit) return shift;
  }
  return null;
}

export async function getReport(
  user: AuthUser | null,
  courseId: number,
  weekStart?: string,
): Promise<WeeklyReport> {
  await latency();
  requireRepCourse(user, courseId);
  // Omitted = the current week (docs/api.md).
  const week_start = weekStartOf(weekStart ?? MOCK_TODAY);
  const weekEnd = addDays(week_start, 6);
  const days = cohortDays(courseId, allDeadlines(), getState().enrolledCourseIds).filter(
    (d) => d.date >= week_start && d.date <= weekEnd && !d.suppressed && d.avg_stress !== null,
  );
  if (days.length === 0) {
    throw new ApiError("not_found", "There aren't enough check-ins for this week yet.", 404);
  }
  const avg = days.reduce((s, d) => s + (d.avg_stress ?? 0), 0) / days.length;
  const peak = days.reduce((a, b) => ((a.avg_stress ?? 0) >= (b.avg_stress ?? 0) ? a : b));
  const collision = collisionsFor(courseId).find((c) => c.start <= weekEnd && c.end >= week_start);
  const weekDeadlines = courseDeadlines(courseId).filter(
    (d) => d.due_date >= week_start && d.due_date <= weekEnd,
  );

  if (collision) {
    // Suggest moving the last item in the pile-up; pushing it later is usually the easiest fix.
    const mine = collision.deadlines.at(-1)!;
    const shift = suggestShift(mine);
    const list = collision.deadlines.map((d) => `${courseCode(d.course_id)} ${d.title}`).join(", ");
    return {
      week_start,
      summary: `Average stress was ${avg.toFixed(1)} this week, peaking at ${peak.avg_stress} on ${longDate(peak.date)}. ${collision.deadline_count} assessments worth ${collision.total_weight_pct}% combined landed between ${rangeLabel(collision.start, collision.end)}: ${list}.`,
      top_cause: `${collision.deadline_count} assessments within ${diffDays(collision.end, collision.start) + 1} days`,
      suggested_fix:
        shift === null
          ? `Ask the other instructors whether one of these could move — every nearby week is already busy for this class.`
          : `Move ${courseCode(mine.course_id)} ${mine.title} ${Math.abs(shift) === 7 ? "a week" : "two weeks"} ${shift < 0 ? "earlier" : "later"}, to ${longDate(addDays(mine.due_date, shift))}. That week has no other major deadline for this class.`,
    };
  }
  const biggest = [...weekDeadlines].sort((a, b) => (b.weight_pct ?? 0) - (a.weight_pct ?? 0))[0];
  if (biggest) {
    return {
      week_start,
      summary: `Average stress was ${avg.toFixed(1)}, with a peak of ${peak.avg_stress} on ${shortDate(peak.date)}. ${weekDeadlines.length} deadline${weekDeadlines.length > 1 ? "s" : ""} this week, none overlapping heavily.`,
      top_cause: `${courseCode(biggest.course_id)} ${biggest.title}`,
      suggested_fix: `No schedule change needed. Posting practice material a week before ${biggest.title} could soften the run-up.`,
    };
  }
  return {
    week_start,
    summary: `A calm week — average stress was ${avg.toFixed(1)} and no major deadlines were due.`,
    top_cause: "General workload",
    suggested_fix:
      "Nothing to fix. A good week for a check-in reminder so next week's data is solid.",
  };
}

export async function getInsights(
  user: AuthUser | null,
  courseId: number,
): Promise<InsightsResponse> {
  await latency();
  requireRepCourse(user, courseId);
  return { insights: INSIGHTS[courseId] ?? [] };
}
