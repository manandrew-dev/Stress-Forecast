import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { CollisionCard } from "@/components/CollisionCard";
import type { CollisionsResponse, Course, Deadline } from "@/api/types";
import { averageCourseWeight, weightByCourse } from "@/lib/weights";
import { CollisionsPage } from "@/pages/rep/CollisionsPage";
import { RepCourseProvider } from "@/pages/rep/RepCourseContext";

const CPSC: Course = { id: 1, code: "CPSC 210", name: "Software Construction", term: "2026W1" };
const MATH: Course = { id: 2, code: "MATH 200", name: "Calculus III", term: "2026W1" };

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
  vi.spyOn(api, "getCourses").mockResolvedValue({ courses: [CPSC, MATH] });
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("rep collision flags", () => {
  it("shows the window, count, deadlines, and nearby peak for each collision", async () => {
    vi.spyOn(api, "getCollisions").mockResolvedValue(collisions);
    renderPage();

    expect(await screen.findByText("Nov 9 – Nov 13")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Midterm 2")).toBeInTheDocument();
    expect(screen.getByText("Project phase 3")).toBeInTheDocument();
    expect(screen.getByText("Quiz 3")).toBeInTheDocument();
    expect(screen.getByText("8.1")).toBeInTheDocument();
    expect(screen.getByText(/on Nov 8/)).toBeInTheDocument();

    expect(screen.getByText("Oct 5 – Oct 8")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Essay 1")).toBeInTheDocument();
    expect(screen.getByText("Lab 2")).toBeInTheDocument();
  });

  it("breaks the weight down by course instead of adding courses together", async () => {
    vi.spyOn(api, "getCollisions").mockResolvedValue(collisions);
    renderPage();

    const lists = await screen.findAllByRole("list", { name: "Share of each course's grade" });
    const items = lists.map((l) =>
      within(l)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    );
    expect(items).toEqual([["CPSC 210 45%", "MATH 200 10%"], ["CPSC 210 45%"]]);
    expect(screen.queryByText("combined")).not.toBeInTheDocument();
    // Nov: CPSC 45%, MATH 10% → 28% (27.5 rounded); Oct: CPSC 45% only → 45%
    const averages = screen
      .getAllByText("avg per course")
      .map((el) => el.parentElement?.textContent);
    expect(averages).toEqual(["28% avg per course", "45% avg per course"]);
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

describe("collision card peak message", () => {
  const base = {
    end: "2026-11-20",
    deadlineCount: 3,
    totalWeight: 50,
    deadlines: [],
    courses: new Map<number, Course>(),
    peak: { value: null, date: null },
    today: "2026-11-16",
  };

  it("says still ahead for a pile-up that starts today", () => {
    render(<CollisionCard {...base} start="2026-11-16" />);
    expect(screen.getByText(/Still ahead/)).toBeInTheDocument();
  });

  it("says not enough responses for a pile-up that started before today", () => {
    render(<CollisionCard {...base} start="2026-11-15" />);
    expect(screen.getByText(/Not enough responses/)).toBeInTheDocument();
  });
});

describe("weightByCourse", () => {
  const d = (
    id: number,
    course_id: number,
    due_date: string,
    weight_pct: number | null,
  ): Deadline => ({
    id,
    course_id,
    title: `D${id}`,
    due_date,
    weight_pct,
    type: "other",
  });

  it("sums each course separately, ordered by first due date", () => {
    expect(
      weightByCourse([
        d(1, 2, "2026-11-06", 20),
        d(2, 1, "2026-11-03", 25),
        d(3, 1, "2026-11-05", 10),
      ]),
    ).toEqual([
      { courseId: 1, weight: 35 },
      { courseId: 2, weight: 20 },
    ]);
  });

  it("ignores missing weights, and shows none when a course has no weights at all", () => {
    expect(
      weightByCourse([
        d(1, 1, "2026-12-04", null),
        d(2, 1, "2026-12-05", 10),
        d(3, 3, "2026-12-04", null),
      ]),
    ).toEqual([
      { courseId: 1, weight: 10 },
      { courseId: 3, weight: null },
    ]);
  });
});

describe("averageCourseWeight", () => {
  const d = (id: number, course_id: number, weight_pct: number | null): Deadline => ({
    id,
    course_id,
    title: `D${id}`,
    due_date: "2026-11-10",
    weight_pct,
    type: "other",
  });

  it("totals each course, then averages across courses", () => {
    // ENGL 10% + 20% = 30%, PHYS 50% → (30 + 50) / 2 = 40%
    expect(averageCourseWeight([d(1, 4, 10), d(2, 4, 20), d(3, 3, 50)])).toBe(40);
  });

  it("leaves out courses with no weights, and returns null when none have any", () => {
    expect(averageCourseWeight([d(1, 4, 30), d(2, 3, null)])).toBe(30);
    expect(averageCourseWeight([d(1, 4, null)])).toBeNull();
  });
});
