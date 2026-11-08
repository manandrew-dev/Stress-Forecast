import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import type { CohortResponse, Course, WeeklyReport } from "@/api/types";
import { ReportPage } from "@/pages/rep/ReportPage";
import { RepCourseProvider } from "@/pages/rep/RepCourseContext";

const CPSC: Course = { id: 1, code: "CPSC 210", name: "Software Construction", term: "2026W1" };

const REPORT: WeeklyReport = {
  week_start: "2026-11-02",
  summary: "Stress rose from 5.1 to 7.4 this week, peaking two days before Midterm 2.",
  top_cause: "overlapping deadlines",
  suggested_fix:
    "Moving Project Phase 3 from Nov 12 to Nov 19 would break up the week 9 collision.",
};

/** Two weeks of cohort days, so Nov 2 is the most recent selectable week. */
function cohort(days: CohortResponse["days"]): CohortResponse {
  return {
    course: CPSC,
    min_students: 5,
    days,
    deadlines: [],
  };
}

const DEFAULT_COHORT = cohort(
  ["2026-10-26", "2026-11-02", "2026-11-07"].map((date) => ({
    date,
    avg_stress: 6,
    n_students: 20,
    suppressed: false,
  })),
);

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(client: QueryClient = newClient()) {
  return render(
    <QueryClientProvider client={client}>
      <RepCourseProvider courses={[CPSC]}>
        <ReportPage />
      </RepCourseProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.setItem("stress-forecast:rep-course", "1");
  vi.spyOn(api, "getCourses").mockResolvedValue({ courses: [CPSC] });
  vi.spyOn(api, "getCohort").mockResolvedValue(DEFAULT_COHORT);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("rep weekly report", () => {
  it("shows the summary, top cause, and suggested fix for the selected week", async () => {
    const getReport = vi.spyOn(api, "getReport").mockResolvedValue(REPORT);
    renderPage();

    expect(await screen.findByText(REPORT.summary)).toBeInTheDocument();
    expect(screen.getByText("Top cause")).toBeInTheDocument();
    expect(screen.getByText(REPORT.top_cause)).toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText(REPORT.suggested_fix)).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledWith(1, "2026-11-02");
  });

  it("shows a loading state while the report is on its way", async () => {
    let resolveReport!: (report: WeeklyReport) => void;
    vi.spyOn(api, "getReport").mockReturnValue(
      new Promise((resolve) => {
        resolveReport = resolve;
      }),
    );
    renderPage();

    await waitFor(() => expect(api.getReport).toHaveBeenCalled());
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveReport(REPORT);
    expect(await screen.findByText(REPORT.summary)).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("fetches a week's report only once across remounts", async () => {
    const getReport = vi.spyOn(api, "getReport").mockResolvedValue(REPORT);
    const client = newClient();

    const first = renderPage(client);
    expect(await screen.findByText(REPORT.summary)).toBeInTheDocument();
    first.unmount();

    renderPage(client);
    expect(await screen.findByText(REPORT.summary)).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it("shows No report yet when the mock API answers 404", async () => {
    const getReport = vi
      .spyOn(api, "getReport")
      .mockRejectedValue(
        new ApiError("not_found", "There aren't enough check-ins for this week yet.", 404),
      );
    renderPage();

    expect(await screen.findByText("No report yet")).toBeInTheDocument();
    expect(
      screen.getByText("There aren't enough check-ins for this week yet."),
    ).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it("shows No report yet when the real API says there is not enough data", async () => {
    vi.spyOn(api, "getReport").mockResolvedValue({
      week_start: "2026-11-02",
      summary: "Not enough students checked in this week to write a report.",
      top_cause: "not enough data",
      suggested_fix: "",
    });
    renderPage();

    expect(await screen.findByText("No report yet")).toBeInTheDocument();
    expect(
      screen.getByText("Not enough students checked in this week to write a report."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Top cause")).not.toBeInTheDocument();
  });

  it("says no report yet when there is no cohort data at all", async () => {
    vi.spyOn(api, "getCohort").mockResolvedValue(cohort([]));
    const getReport = vi.spyOn(api, "getReport");
    renderPage();

    expect(await screen.findByText("No report yet")).toBeInTheDocument();
    expect(
      screen.getByText("There aren't enough check-ins for this course yet."),
    ).toBeInTheDocument();
    expect(getReport).not.toHaveBeenCalled();
  });

  it.each([
    ["ai_parse_failed", 422, "Gemini returned an unusable report."],
    ["rate_limited", 429, "The free Gemini quota is used up for now."],
    ["service_unavailable", 503, "The report service is taking a break."],
  ])("does not retry a %s error", async (code, status, message) => {
    const getReport = vi
      .spyOn(api, "getReport")
      .mockRejectedValue(new ApiError(code, message, status));
    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledTimes(1);
  });
});
