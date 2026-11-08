// The mock "server" must behave like docs/api.md so pages built on it work against the real API.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeadlineDraft } from "@/api/types";
import { FAKE_USERS } from "@/auth/session";
import { MOCK_TODAY } from "@/mocks/data";
import * as mock from "@/mocks/handlers";
import { getState, resetMockState } from "@/mocks/store";

const student = FAKE_USERS.student;
const rep = FAKE_USERS.rep;

/** Run a handler to completion through its fake latency, without unhandled rejections. */
async function run<T>(p: Promise<T>): Promise<T> {
  const settled = p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.runAllTimersAsync();
  const r = await settled;
  if (!r.ok) throw r.error;
  return r.value;
}

const draft = (title: string, due_date: string, weight_pct: number | null = 10): DeadlineDraft => ({
  title,
  due_date,
  weight_pct,
  type: "assignment",
});

const DOCUMENTED_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "ai_parse_failed",
  "internal",
];

beforeEach(() => {
  vi.useFakeTimers();
  resetMockState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /deadlines (mock)", () => {
  it("replaces the student's earlier deadlines for that course", async () => {
    await run(
      mock.postDeadlines(student, {
        course_id: 3,
        deadlines: [draft("Lab 1", "2026-11-12"), draft("Lab 2", "2026-11-19")],
      }),
    );
    const second = await run(
      mock.postDeadlines(student, { course_id: 3, deadlines: [draft("Lab 2", "2026-11-20")] }),
    );

    const course3 = getState().extraDeadlines.filter((d) => d.course_id === 3);
    expect(course3.map((d) => [d.title, d.due_date])).toEqual([["Lab 2", "2026-11-20"]]);
    expect(second.deadlines).toHaveLength(1);
    expect(second.deadlines[0]).toMatchObject({
      course_id: 3,
      title: "Lab 2",
      due_date: "2026-11-20",
    });
  });

  it("leaves the student's deadlines for other courses alone", async () => {
    await run(
      mock.postDeadlines(student, { course_id: 2, deadlines: [draft("Extra", "2026-11-25")] }),
    );
    await run(mock.postDeadlines(student, { course_id: 3, deadlines: [] }));
    expect(getState().extraDeadlines.map((d) => d.title)).toEqual(["Extra"]);
  });

  it("rejects an invalid deadline with bad_request", async () => {
    await expect(
      run(
        mock.postDeadlines(student, { course_id: 3, deadlines: [draft("Lab 1", "next tuesday")] }),
      ),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });
});

describe("PUT / DELETE /deadlines/{id} (mock)", () => {
  it("lets the creator edit and delete their deadline", async () => {
    const { deadlines } = await run(
      mock.postDeadlines(student, { course_id: 3, deadlines: [draft("Lab 1", "2026-11-12")] }),
    );
    const id = deadlines[0]!.id;

    const updated = await run(
      mock.putDeadline(student, id, draft("Lab 1 (moved)", "2026-11-13", 12)),
    );
    expect(updated).toEqual({
      id,
      course_id: 3,
      title: "Lab 1 (moved)",
      due_date: "2026-11-13",
      weight_pct: 12,
      type: "assignment",
    });

    await expect(run(mock.deleteDeadline(student, id))).resolves.toBeUndefined();
    expect(getState().extraDeadlines).toHaveLength(0);
  });

  it("forbids changing someone else's deadline", async () => {
    await expect(run(mock.deleteDeadline(student, 1))).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });

  it("returns not_found for an unknown id", async () => {
    await expect(
      run(mock.putDeadline(student, 999_999, draft("x", "2026-11-12"))),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });

  it("is student-only", async () => {
    await expect(run(mock.deleteDeadline(rep, 1))).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
  });
});

describe("query params (mock)", () => {
  it("filters the trend by from/to", async () => {
    await run(mock.putMyCourses(student, [1]));
    const all = await run(mock.getMyTrend(student));
    const oct = await run(mock.getMyTrend(student, { from: "2026-10-01", to: "2026-10-31" }));

    expect(oct.points.length).toBeGreaterThan(0);
    expect(oct.points.length).toBeLessThan(all.points.length);
    expect(oct.points.every((p) => p.date >= "2026-10-01" && p.date <= "2026-10-31")).toBe(true);
    expect(
      oct.deadlines.every((d) => d.due_date >= "2026-10-01" && d.due_date <= "2026-10-31"),
    ).toBe(true);
  });

  it("filters the cohort by from/to", async () => {
    // The seed has no check-ins on the demo day itself, so the series ends the day before.
    const res = await run(mock.getCohort(rep, 1, { from: "2026-11-01", to: "2026-11-07" }));
    expect(res.days.map((d) => d.date)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
  });

  it("defaults the weekly report to the current week", async () => {
    const withDefault = await run(mock.getReport(rep, 1));
    const explicit = await run(mock.getReport(rep, 1, MOCK_TODAY));
    expect(withDefault).toEqual(explicit);
  });
});

describe("error codes (mock)", () => {
  it("only uses codes documented in docs/api.md", async () => {
    // Thunks, so each request starts only when we are ready to catch its rejection.
    const failures: (() => Promise<unknown>)[] = [
      () => mock.postSyllabus(student, { course_id: 1, text: "   " }),
      () =>
        mock.postSyllabus(student, {
          course_id: 1,
          file: new File(["x"], "notes.txt", { type: "text/plain" }),
        }),
      () => mock.postCheckin(student, ""),
      () => mock.getMe(null),
      () => mock.getCohort(student, 1),
      () => mock.getCohort(rep, 3),
      () => mock.getCohort(rep, 999),
    ];
    for (const start of failures) {
      const err = await run(start()).catch((e: unknown) => e);
      expect(DOCUMENTED_CODES).toContain((err as { code?: string }).code);
    }
  });
});

describe("GET /report (mock)", () => {
  it("answers a week without check-ins like the real API", async () => {
    const report = await run(mock.getReport(rep, 1, "2025-01-06"));
    expect(report).toMatchObject({ week_start: "2025-01-06", top_cause: "not enough data" });
  });
});

describe("mock data mirrors db/seed.py", () => {
  it("shows the rep the week 9 pile-up across CPSC 210 and MATH 200, like the seed", async () => {
    const { collisions } = await run(mock.getCollisions(rep, 1));
    const week9 = collisions.find((c) => c.start >= "2026-11-02" && c.start <= "2026-11-08");
    expect(week9).toMatchObject({ deadline_count: 3, total_weight_pct: 55, students_affected: 10 });
    expect(week9!.deadlines.map((d) => [d.course_id, d.title])).toEqual([
      [1, "Midterm 2"],
      [2, "Midterm 2"],
      [1, "Quiz 4"],
    ]);
    expect(week9!.peak_avg_stress).not.toBeNull();
  });

  it("shows the rep pile-ups across the courses the class shares", async () => {
    const { cohort_size, collisions } = await run(mock.getCollisions(rep, 1));
    expect(cohort_size).toBe(25);
    const finals = collisions.find((c) => c.start === "2026-12-10");
    expect(finals).toMatchObject({
      deadline_count: 3,
      total_weight_pct: 95,
      students_affected: 20,
    });
    expect(new Set(finals!.deadlines.map((d) => d.course_id))).toEqual(new Set([1, 2, 3]));
    // Every rep pile-up includes one of the course's own deadlines.
    expect(collisions.every((c) => c.deadlines.some((d) => d.course_id === 1))).toBe(true);
  });

  it("puts shared courses' deadlines on the cohort chart", async () => {
    const { deadlines } = await run(mock.getCohort(rep, 1));
    expect(new Set(deadlines.map((d) => d.course_id))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("only hides the seed's low-response day", async () => {
    const { days } = await run(mock.getCohort(rep, 1));
    expect(days.filter((d) => d.suppressed).map((d) => d.date)).toEqual(["2026-09-13"]);
    expect(days.every((d) => d.suppressed || (d.n_students ?? 0) >= 5)).toBe(true);
  });

  it("starts the demo student enrolled in DEMO CPSC 210 and DEMO MATH 200", async () => {
    const me = await run(mock.getMe(student));
    expect(me.courses.map((c) => c.code)).toEqual(["DEMO CPSC 210", "DEMO MATH 200"]);
  });
});
