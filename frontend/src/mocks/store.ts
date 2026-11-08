import type { Deadline, TrendPoint } from "@/api/types";
import { DEMO_STUDENT_COURSE_IDS } from "./data";

// Mutable mock "server" state. Persisted to localStorage so the demo survives a refresh.
interface MockState {
  enrolledCourseIds: number[];
  extraDeadlines: Deadline[];
  todayCheckin: TrendPoint | null;
  nextDeadlineId: number;
}

// v2: mock data now mirrors db/seed.py; old saved state (old deadline ids) is ignored.
const KEY = "stress-forecast:mock-state:v2";

const initial = (): MockState => ({
  // The seeded demo student starts enrolled in DEMO CPSC 210 + DEMO MATH 200 (db/seed.py).
  enrolledCourseIds: [...DEMO_STUDENT_COURSE_IDS],
  extraDeadlines: [],
  todayCheckin: null,
  nextDeadlineId: 1000,
});

let state: MockState | null = null;

export function getState(): MockState {
  if (state) return state;
  state = initial();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) state = { ...state, ...(JSON.parse(raw) as Partial<MockState>) };
    } catch {
      // ignore corrupt storage
    }
  }
  return state;
}

export function setState(patch: Partial<MockState>): void {
  state = { ...getState(), ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  }
}

export function resetMockState(): void {
  state = initial();
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
