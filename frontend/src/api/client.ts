// The one typed API client. This is the ONLY module allowed to call fetch().
// Shapes follow docs/api.md exactly. While USE_MOCKS is on (VITE_USE_MOCKS !== "false"),
// every function answers from src/mocks instead of the network.
import { getSessionUser } from "@/auth/session";
import * as mock from "@/mocks/handlers";
import { ApiError } from "./errors";
import type {
  ApiErrorBody,
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
  SaveDeadlinesResponse,
  SyllabusResponse,
  TrendResponse,
  WeeklyReport,
} from "./types";

export type { DateRange } from "./types";

const USE_MOCKS = import.meta.env["VITE_USE_MOCKS"] !== "false";
const API_BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "/api").replace(
  /\/+$/,
  "",
);

// ---------- auth token ----------

type TokenProvider = () => Promise<string | null | undefined>;
let tokenProvider: TokenProvider | null = null;

/**
 * Real auth plugs in here (Auth0, issue #4): pass a function that returns the
 * access token for our API audience, e.g. `() => getAccessTokenSilently()`.
 * Every real request then sends `Authorization: Bearer <token>`. Pass null on logout.
 */
export function setAccessTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

// ---------- transport ----------

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");

  let token: string | null | undefined;
  try {
    token = await tokenProvider?.();
  } catch {
    throw new ApiError("unauthorized", "Your session has expired. Please log in again.", 401);
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    // Bearer tokens only: no cookies, so the API doesn't need credentialed CORS.
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    // Client-side code (not from the API): the request never reached the server.
    throw new ApiError("network_error", "Can't reach the server. Check your connection.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(
      err?.code ?? (res.status >= 500 ? "internal" : "bad_request"),
      err?.message ?? `Request failed (${res.status}).`,
      res.status,
    );
  }
  return data as T;
}

const json = (body: unknown) => JSON.stringify(body);

// ---------- endpoints (docs/api.md) ----------

export const api = {
  // Shared

  getMe(): Promise<MeResponse> {
    if (USE_MOCKS) return mock.getMe(getSessionUser());
    return request("/me");
  },

  getCourses(): Promise<CoursesResponse> {
    if (USE_MOCKS) return mock.getCourses(getSessionUser());
    return request("/courses");
  },

  // Student

  updateMyCourses(course_ids: number[]): Promise<void> {
    if (USE_MOCKS) return mock.putMyCourses(getSessionUser(), course_ids);
    return request("/me/courses", { method: "PUT", body: json({ course_ids }) });
  },

  /** Extracts deadlines with Gemini. Does not save them; the student reviews first. */
  uploadSyllabus(
    input: { course_id: number; text: string } | { course_id: number; file: File },
  ): Promise<SyllabusResponse> {
    if (USE_MOCKS) return mock.postSyllabus(getSessionUser(), input);
    if ("file" in input) {
      const form = new FormData();
      form.append("course_id", String(input.course_id));
      form.append("file", input.file);
      return request("/syllabus", { method: "POST", body: form });
    }
    return request("/syllabus", { method: "POST", body: json(input) });
  },

  /** Replaces any deadlines this student previously saved for the course. */
  saveDeadlines(course_id: number, deadlines: DeadlineDraft[]): Promise<SaveDeadlinesResponse> {
    if (USE_MOCKS) return mock.postDeadlines(getSessionUser(), { course_id, deadlines });
    return request("/deadlines", { method: "POST", body: json({ course_id, deadlines }) });
  },

  /** Creator only. */
  updateDeadline(id: number, deadline: DeadlineDraft): Promise<Deadline> {
    if (USE_MOCKS) return mock.putDeadline(getSessionUser(), id, deadline);
    return request(`/deadlines/${id}`, { method: "PUT", body: json(deadline) });
  },

  /** Creator only. */
  deleteDeadline(id: number): Promise<void> {
    if (USE_MOCKS) return mock.deleteDeadline(getSessionUser(), id);
    return request(`/deadlines/${id}`, { method: "DELETE" });
  },

  /** A second check-in on the same local day replaces the first. */
  checkin(text: string): Promise<CheckinResponse> {
    if (USE_MOCKS) return mock.postCheckin(getSessionUser(), text);
    return request("/checkins", { method: "POST", body: json({ text }) });
  },

  getMyTrend(range: DateRange = {}): Promise<TrendResponse> {
    if (USE_MOCKS) return mock.getMyTrend(getSessionUser(), range);
    return request(withQuery("/me/trend", { from: range.from, to: range.to }));
  },

  getHeadsUp(): Promise<HeadsUpResponse> {
    if (USE_MOCKS) return mock.getHeadsUp(getSessionUser());
    return request("/me/heads-up");
  },

  // Rep (role rep + assigned to the course, else 403)

  getCohort(courseId: number, range: DateRange = {}): Promise<CohortResponse> {
    if (USE_MOCKS) return mock.getCohort(getSessionUser(), courseId, range);
    return request(withQuery(`/courses/${courseId}/cohort`, { from: range.from, to: range.to }));
  },

  getCollisions(courseId: number): Promise<CollisionsResponse> {
    if (USE_MOCKS) return mock.getCollisions(getSessionUser(), courseId);
    return request(`/courses/${courseId}/collisions`);
  },

  /** `weekStart` omitted = the current week. */
  getReport(courseId: number, weekStart?: string): Promise<WeeklyReport> {
    if (USE_MOCKS) return mock.getReport(getSessionUser(), courseId, weekStart);
    return request(withQuery(`/courses/${courseId}/report`, { week_start: weekStart }));
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
  trend: (uid: string, range: DateRange = {}) =>
    ["trend", uid, range.from ?? null, range.to ?? null] as const,
  headsUp: (uid: string) => ["heads-up", uid] as const,
  cohort: (id: number, range: DateRange = {}) =>
    ["cohort", id, range.from ?? null, range.to ?? null] as const,
  collisions: (id: number) => ["collisions", id] as const,
  report: (id: number, week?: string) => ["report", id, week ?? null] as const,
  insights: (id: number) => ["insights", id] as const,
};
