import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import type { CohortResponse, Course } from "@/api/types";
import { CohortPage } from "@/pages/rep/CohortPage";
import { PickCourse } from "@/pages/rep/PickCourse";
import { RepCourseProvider } from "@/pages/rep/RepCourseContext";

const CPSC: Course = { id: 1, code: "CPSC 210", name: "Software Construction", term: "2026W1" };

function cohort(days: CohortResponse["days"]): CohortResponse {
  return {
    course: CPSC,
    min_students: 5,
    days,
    deadlines: [
      {
        id: 105,
        course_id: 1,
        title: "Midterm 2",
        due_date: "2026-11-03",
        weight_pct: 25,
        type: "midterm",
      },
    ],
  };
}

function renderWith(ui: ReactNode, courses: Course[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RepCourseProvider courses={courses}>{ui}</RepCourseProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // The chart measures its container; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  window.localStorage.setItem("stress-forecast:rep-course", "1");
  vi.spyOn(api, "getCourses").mockResolvedValue({ courses: [CPSC] });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("rep course picker", () => {
  it("says so when the rep has no assigned courses", () => {
    renderWith(<PickCourse />, []);
    expect(screen.getByText("No courses assigned yet")).toBeInTheDocument();
  });
});

describe("rep cohort view", () => {
  it("shows the empty state when every day is under the 5-student minimum", async () => {
    vi.spyOn(api, "getCohort").mockResolvedValue(
      cohort([
        { date: "2026-11-01", avg_stress: null, n_students: null, suppressed: true },
        { date: "2026-11-02", avg_stress: null, n_students: null, suppressed: true },
      ]),
    );
    renderWith(<CohortPage />, [CPSC]);
    expect(await screen.findByText("No check-in data yet")).toBeInTheDocument();
    expect(screen.queryByText("Term average")).not.toBeInTheDocument();
  });

  it("shows the stats and chart when there is data, ignoring suppressed days", async () => {
    vi.spyOn(api, "getCohort").mockResolvedValue(
      cohort([
        { date: "2026-11-01", avg_stress: 4, n_students: 20, suppressed: false },
        { date: "2026-11-02", avg_stress: null, n_students: null, suppressed: true },
        { date: "2026-11-03", avg_stress: 8, n_students: 25, suppressed: false },
      ]),
    );
    renderWith(<CohortPage />, [CPSC]);
    expect(await screen.findByText("Term average")).toBeInTheDocument();
    expect(screen.getByText("6.0")).toBeInTheDocument(); // (4 + 8) / 2, suppressed day left out
    expect(screen.getByText("Hidden days").nextSibling).toHaveTextContent("1");
    expect(screen.queryByText("No check-in data yet")).not.toBeInTheDocument();
  });
});
