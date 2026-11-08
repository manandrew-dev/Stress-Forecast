import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import type { Course, Deadline } from "@/api/types";
import { relativeDay } from "@/lib/dates";
import { DeadlinesPage } from "@/pages/student/DeadlinesPage";

const CPSC: Course = {
  id: 1,
  code: "DEMO CPSC 210",
  name: "Software Construction",
  term: "2026W1",
};
const MATH: Course = { id: 2, code: "DEMO MATH 200", name: "Calculus III", term: "2026W1" };
const d = (
  id: number,
  course_id: number,
  title: string,
  due_date: string,
  weight_pct: number | null,
): Deadline => ({
  id,
  course_id,
  title,
  due_date,
  weight_pct,
  type: "midterm",
});
const DEADLINES = [
  d(3, 1, "Midterm 2", "2026-11-03", 20),
  d(9, 2, "Midterm 2", "2026-11-05", 25),
  d(5, 1, "Quiz 4", "2026-11-07", 10),
  d(4, 1, "Project Phase 3", "2026-11-19", 25),
  d(10, 2, "Final Exam", "2026-12-14", 40),
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeadlinesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 6, 12, 0)); // Fri Nov 6, local time
  vi.spyOn(api, "getCourses").mockResolvedValue({ courses: [CPSC, MATH] });
  vi.spyOn(api, "getMyTrend").mockResolvedValue({ points: [], deadlines: DEADLINES });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("relativeDay", () => {
  it("says today, tomorrow, in N days, and N days ago", () => {
    expect(relativeDay("2026-11-06", "2026-11-06")).toBe("Today");
    expect(relativeDay("2026-11-07", "2026-11-06")).toBe("Tomorrow");
    expect(relativeDay("2026-11-19", "2026-11-06")).toBe("In 13 days");
    expect(relativeDay("2026-11-05", "2026-11-06")).toBe("Yesterday");
    expect(relativeDay("2026-11-03", "2026-11-06")).toBe("3 days ago");
  });
});

describe("deadlines page", () => {
  it("splits upcoming deadlines into the next 7 days and later, with past ones folded away", async () => {
    renderPage();
    const week = (await screen.findByRole("heading", { name: "Next 7 days" })).parentElement!;
    expect(within(week).getByText("Quiz 4")).toBeInTheDocument();
    expect(within(week).getByText("Tomorrow")).toBeInTheDocument();

    const later = screen.getByRole("heading", { name: "Later this term" }).parentElement!;
    expect(within(later).getByText("Project Phase 3")).toBeInTheDocument();
    expect(within(later).getByText("Final Exam")).toBeInTheDocument();

    // 3 upcoming; still ahead per course (weights are shares of each course's own grade):
    // CPSC 210 Quiz 4 + Project Phase 3 = 35%, MATH 200 Final Exam = 40%. Never summed across courses.
    const summary = screen.getByText(/upcoming/).closest("p")!;
    expect(summary).toHaveTextContent(
      "3 upcoming · still ahead: DEMO CPSC 210 35% · DEMO MATH 200 40%",
    );
    expect(screen.queryByRole("heading", { name: "Past" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show 2 past deadlines/i }));
    const past = screen.getByRole("heading", { name: "Past" }).parentElement!;
    expect(within(past).getAllByText("Midterm 2")).toHaveLength(2);
  });

  it("filters by course", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "DEMO MATH 200" }));
    expect(screen.queryByText("Quiz 4")).not.toBeInTheDocument();
    expect(screen.getByText("Final Exam")).toBeInTheDocument();
    expect(screen.getByText(/upcoming/).closest("p")!).toHaveTextContent(
      "1 upcoming · 40% of DEMO MATH 200’s grade still ahead",
    );
    expect(screen.getByRole("button", { name: "DEMO MATH 200" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
