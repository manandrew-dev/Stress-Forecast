import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import type { CollisionsResponse, Course } from "@/api/types";
import { CollisionsPage } from "@/pages/rep/CollisionsPage";
import { RepCourseProvider } from "@/pages/rep/RepCourseContext";

const CPSC: Course = { id: 1, code: "CPSC 210", name: "Software Construction", term: "2026W1" };

const collisions: CollisionsResponse = {
  collisions: [
    {
      start: "2026-11-09",
      end: "2026-11-13",
      deadline_count: 3,
      total_weight_pct: 55,
      deadlines: [
        {
          id: 12,
          course_id: 1,
          title: "Midterm 2",
          due_date: "2026-11-10",
          weight_pct: 25,
          type: "midterm",
        },
        {
          id: 13,
          course_id: 1,
          title: "Project phase 3",
          due_date: "2026-11-12",
          weight_pct: 20,
          type: "project",
        },
        {
          id: 14,
          course_id: 2,
          title: "Quiz 3",
          due_date: "2026-11-13",
          weight_pct: 10,
          type: "quiz",
        },
      ],
      peak_avg_stress: 8.1,
      peak_date: "2026-11-08",
    },
    {
      start: "2026-10-05",
      end: "2026-10-08",
      deadline_count: 2,
      total_weight_pct: 45,
      deadlines: [
        {
          id: 15,
          course_id: 1,
          title: "Essay 1",
          due_date: "2026-10-05",
          weight_pct: 25,
          type: "assignment",
        },
        {
          id: 16,
          course_id: 1,
          title: "Lab 2",
          due_date: "2026-10-08",
          weight_pct: 20,
          type: "assignment",
        },
      ],
      peak_avg_stress: null,
      peak_date: null,
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RepCourseProvider courses={[CPSC]}>
        <CollisionsPage />
      </RepCourseProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.setItem("stress-forecast:rep-course", "1");
  vi.spyOn(api, "getCourses").mockResolvedValue({ courses: [CPSC] });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("rep collision flags", () => {
  it("shows the window, count, combined weight, deadlines, and nearby peak for each collision", async () => {
    vi.spyOn(api, "getCollisions").mockResolvedValue(collisions);
    renderPage();

    expect(await screen.findByText("Nov 9 – Nov 13")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("Midterm 2")).toBeInTheDocument();
    expect(screen.getByText("Project phase 3")).toBeInTheDocument();
    expect(screen.getByText("Quiz 3")).toBeInTheDocument();
    expect(screen.getByText("8.1")).toBeInTheDocument();
    expect(screen.getByText(/on Nov 8/)).toBeInTheDocument();

    expect(screen.getByText("Oct 5 – Oct 8")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("Essay 1")).toBeInTheDocument();
    expect(screen.getByText("Lab 2")).toBeInTheDocument();
  });

  it("says Not enough responses when a collision has no nearby stress peak", async () => {
    vi.spyOn(api, "getCollisions").mockResolvedValue(collisions);
    renderPage();

    expect(await screen.findByText(/Not enough responses/)).toBeInTheDocument();
    expect(screen.queryByText(/No stress data yet/)).not.toBeInTheDocument();
  });

  it("shows the empty state when no deadlines collide", async () => {
    vi.spyOn(api, "getCollisions").mockResolvedValue({ collisions: [] });
    renderPage();

    expect(await screen.findByText("No pile-ups this term")).toBeInTheDocument();
    expect(screen.queryByText("Not enough responses")).not.toBeInTheDocument();
  });

  it("says the pile-up is still ahead when it hasn't started yet", async () => {
    vi.spyOn(api, "getCollisions").mockResolvedValue({
      collisions: [
        {
          start: "2099-11-16",
          end: "2099-11-20",
          deadline_count: 3,
          total_weight_pct: 50,
          deadlines: [],
          peak_avg_stress: null,
          peak_date: null,
        },
      ],
    });
    renderPage();

    expect(await screen.findByText(/Still ahead/)).toBeInTheDocument();
    expect(screen.queryByText(/Not enough responses/)).not.toBeInTheDocument();
  });
});
