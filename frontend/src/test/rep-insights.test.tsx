import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import type { Course, Insight } from "@/api/types";
import { InsightsPage } from "@/pages/rep/InsightsPage";
import { RepCourseProvider } from "@/pages/rep/RepCourseContext";

const CPSC: Course = { id: 1, code: "CPSC 210", name: "Software Construction", term: "2026W1" };

/** Newest first, as the API returns them. */
const INSIGHTS: [Insight, ...Insight[]] = [
  {
    week_start: "2026-11-09",
    finding:
      "Weeks with assessments worth 40%+ inside 5 days preceded the 3 highest stress spikes.",
  },
  {
    week_start: "2026-11-02",
    finding: "Midterm 2, Project Phase 3 and Quiz 4 (55% combined) fell within 5 days.",
  },
  {
    week_start: "2026-10-26",
    finding: "Average stress rose in the 3 days before Midterm 1 and eased after it.",
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RepCourseProvider courses={[CPSC]}>
        <InsightsPage />
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

describe("rep insights panel", () => {
  it("shows each finding with its week, newest first as returned", async () => {
    vi.spyOn(api, "getInsights").mockResolvedValue({ insights: INSIGHTS });
    renderPage();

    expect(await screen.findByText(INSIGHTS[0].finding)).toBeInTheDocument();
    for (const insight of INSIGHTS) {
      expect(screen.getByText(insight.finding)).toBeInTheDocument();
    }

    const weeks = screen.getAllByText(/^Week of /).map((el) => el.textContent);
    expect(weeks).toEqual([
      "Week of Nov 9 – Nov 15",
      "Week of Nov 2 – Nov 8",
      "Week of Oct 26 – Nov 1",
    ]);
  });

  it("shows No insights yet when the notebook hasn't written any", async () => {
    vi.spyOn(api, "getInsights").mockResolvedValue({ insights: [] });
    renderPage();

    expect(await screen.findByText("No insights yet")).toBeInTheDocument();
  });

  it("shows the error with Try again and reloads the findings", async () => {
    const getInsights = vi
      .spyOn(api, "getInsights")
      .mockRejectedValueOnce(new ApiError("internal", "Internal Server Error", 500))
      .mockResolvedValue({ insights: INSIGHTS });
    renderPage();

    expect(await screen.findByText("Internal Server Error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(INSIGHTS[0].finding)).toBeInTheDocument();
    expect(getInsights).toHaveBeenCalledTimes(2);
  });

  it("credits the Databricks analysis as the source of the findings", async () => {
    vi.spyOn(api, "getInsights").mockResolvedValue({ insights: INSIGHTS });
    renderPage();

    expect(
      await screen.findByText("Found by our Databricks analysis of class-wide averages"),
    ).toBeInTheDocument();
  });

  it("doesn't refetch the findings when the browser tab regains focus", async () => {
    const getInsights = vi.spyOn(api, "getInsights").mockResolvedValue({ insights: INSIGHTS });
    renderPage();
    expect(await screen.findByText(INSIGHTS[0].finding)).toBeInTheDocument();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(getInsights).toHaveBeenCalledTimes(1);
    focusManager.setFocused(undefined);
  });
});
