import type { Deadline, TrendPoint } from "@/api/types";

// Mutable mock "server" state. Persisted to localStorage so the demo survives a refresh.
interface MockState {
  enrolledCourseIds: number[];
  extraDeadlines: Deadline[];
  todayCheckin: TrendPoint | null;
  nextDeadlineId: number;
}

const KEY = "stress-forecast:mock-state";

const initial = (): MockState => ({
  enrolledCourseIds: [],
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
