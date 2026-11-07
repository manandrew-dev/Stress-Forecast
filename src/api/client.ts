// The one typed API client. This is the ONLY module allowed to call fetch().
// While USE_MOCKS is on, every function answers from src/mocks instead of the network.
import { getSessionUser } from "@/auth/session";
import * as mock from "@/mocks/handlers";
import { ApiError } from "./errors";
import type {
  ApiErrorBody,
  CheckinResponse,
  CohortResponse,
  CollisionsResponse,
  CoursesResponse,
  DeadlineDraft,
  HeadsUpResponse,
  InsightsResponse,
  MeResponse,
  SaveDeadlinesResponse,
  SyllabusResponse,
  TrendResponse,
  WeeklyReport,
} from "./types";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  // TODO(real auth): attach the session token here, e.g. headers.set("Authorization", `Bearer ${token}`).

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError("network_error", "Can't reach the server. Check your connection.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(err?.code ?? "http_error", err?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  getMe(): Promise<MeResponse> {
    if (USE_MOCKS) return mock.getMe(getSessionUser());
    return request("/me");
  },

  getCourses(): Promise<CoursesResponse> {
    if (USE_MOCKS) return mock.getCourses(getSessionUser());
    return request("/courses");
  },

  updateMyCourses(course_ids: number[]): Promise<void> {
    if (USE_MOCKS) return mock.putMyCourses(getSessionUser(), course_ids);
    return request("/me/courses", { method: "PUT", body: json({ course_ids }) });
  },

  uploadSyllabus(input: { course_id: number; text: string } | { course_id: number; file: File }): Promise<SyllabusResponse> {
    if (USE_MOCKS) return mock.postSyllabus(getSessionUser(), input);
    if ("file" in input) {
      const form = new FormData();
      form.append("course_id", String(input.course_id));
      form.append("file", input.file);
      return request("/syllabus", { method: "POST", body: form });
    }
    return request("/syllabus", { method: "POST", body: json(input) });
  },

  saveDeadlines(course_id: number, deadlines: DeadlineDraft[]): Promise<SaveDeadlinesResponse> {
    if (USE_MOCKS) return mock.postDeadlines(getSessionUser(), { course_id, deadlines });
    return request("/deadlines", { method: "POST", body: json({ course_id, deadlines }) });
  },

  checkin(text: string): Promise<CheckinResponse> {
    if (USE_MOCKS) return mock.postCheckin(getSessionUser(), text);
    return request("/checkins", { method: "POST", body: json({ text }) });
  },

  getMyTrend(): Promise<TrendResponse> {
    if (USE_MOCKS) return mock.getMyTrend(getSessionUser());
    return request("/me/trend");
  },

  getHeadsUp(): Promise<HeadsUpResponse> {
    if (USE_MOCKS) return mock.getHeadsUp(getSessionUser());
    return request("/me/heads-up");
  },

  getCohort(courseId: number): Promise<CohortResponse> {
    if (USE_MOCKS) return mock.getCohort(getSessionUser(), courseId);
    return request(`/courses/${courseId}/cohort`);
  },

  getCollisions(courseId: number): Promise<CollisionsResponse> {
    if (USE_MOCKS) return mock.getCollisions(getSessionUser(), courseId);
    return request(`/courses/${courseId}/collisions`);
  },

  getReport(courseId: number, weekStart: string): Promise<WeeklyReport> {
    if (USE_MOCKS) return mock.getReport(getSessionUser(), courseId, weekStart);
    return request(`/courses/${courseId}/report?week_start=${encodeURIComponent(weekStart)}`);
  },

  getInsights(courseId: number): Promise<InsightsResponse> {
    if (USE_MOCKS) return mock.getInsights(getSessionUser(), courseId);
    return request(`/courses/${courseId}/insights`);
  },
};

/** React Query keys, scoped by user so switching roles never shows stale data. */
export const qk = {
  me: (uid: string) => ["me", uid] as const,
  courses: () => ["courses"] as const,
  trend: (uid: string) => ["trend", uid] as const,
  headsUp: (uid: string) => ["heads-up", uid] as const,
  cohort: (id: number) => ["cohort", id] as const,
  collisions: (id: number) => ["collisions", id] as const,
  report: (id: number, week: string) => ["report", id, week] as const,
  insights: (id: number) => ["insights", id] as const,
};
