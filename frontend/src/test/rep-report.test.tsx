import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("doesn't retry a server error, since each try can cost a Gemini call", async () => {
    // The API answers Gemini quota and overload errors with a plain 500 (backend/app/errors.py).
    const getReport = vi
      .spyOn(api, "getReport")
      .mockRejectedValue(new ApiError("internal", "Internal Server Error", 500));
    renderPage(new QueryClient());

    expect(await screen.findByText("Internal Server Error")).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a Gemini parse failure", async () => {
    const getReport = vi
      .spyOn(api, "getReport")
      .mockRejectedValue(new ApiError("ai_parse_failed", "Gemini returned unusable output.", 422));
    renderPage(new QueryClient());

    expect(await screen.findByText("Gemini returned unusable output.")).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it("shows Course not found as an error, not as an empty report", async () => {
    vi.spyOn(api, "getReport").mockRejectedValue(
      new ApiError("not_found", "Course not found", 404),
    );
    renderPage();

    expect(await screen.findByText("Course not found")).toBeInTheDocument();
    expect(screen.queryByText("No report yet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("retries a network error once, then shows it", async () => {
    const getReport = vi
      .spyOn(api, "getReport")
      .mockRejectedValue(new ApiError("network_error", "Can't reach the server.", 0));
    renderPage(new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } }));

    expect(await screen.findByText("Can't reach the server.")).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledTimes(2);
  });

  it("loads the report when the rep clicks Try again", async () => {
    const getReport = vi
      .spyOn(api, "getReport")
      .mockRejectedValueOnce(new ApiError("internal", "Internal Server Error", 500))
      .mockResolvedValue(REPORT);
    renderPage(new QueryClient());

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(REPORT.summary)).toBeInTheDocument();
    expect(getReport).toHaveBeenCalledTimes(2);
  });

  it("doesn't refetch when the browser tab regains focus", async () => {
    const getReport = vi.spyOn(api, "getReport").mockResolvedValue(REPORT);
    renderPage();
    expect(await screen.findByText(REPORT.summary)).toBeInTheDocument();

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(getReport).toHaveBeenCalledTimes(1);
    focusManager.setFocused(undefined);
  });

  it("loads the previous week with the arrow, and reuses the first week on the way back", async () => {
    const getReport = vi.spyOn(api, "getReport").mockImplementation(async (_course, week) => ({
      ...REPORT,
      week_start: week!,
      summary: `Report for ${week}`,
    }));
    renderPage();

    expect(await screen.findByText("Report for 2026-11-02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(await screen.findByText("Report for 2026-10-26")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(await screen.findByText("Report for 2026-11-02")).toBeInTheDocument();

    expect(getReport.mock.calls.map((c) => c[1])).toEqual(["2026-11-02", "2026-10-26"]);
  });
});
