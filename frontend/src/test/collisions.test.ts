// Mirrors backend/tests/test_collisions.py case for case, so the mock collision rules
// can't drift from backend/app/services/collisions.py. Change both together.
import { describe, expect, it } from "vitest";

import type { Deadline } from "@/api/types";
import {
  crossCourseRepCollisions,
  detectCollisions,
  headsUp,
  headsUpMessage,
  repCollisions,
} from "@/mocks/collisions";

let nextId = 1;
function d(day: string, weight: number | null = 10, title?: string, course_id = 1): Deadline {
  const id = nextId++;
  return {
    id,
    course_id,
    title: title ?? `Item ${id}`,
    due_date: day,
    weight_pct: weight,
    type: "assignment",
  };
}

function only<T>(xs: T[]): T {
  expect(xs).toHaveLength(1);
  return xs[0]!;
}

describe("detectCollisions (backend parity)", () => {
  it("no deadlines", () => {
    expect(detectCollisions([])).toEqual([]);
  });

  it("two light deadlines are not a collision", () => {
    expect(detectCollisions([d("2026-11-10", 10), d("2026-11-11", 10)])).toEqual([]);
  });

  it("three deadlines in five days; window ends on the window's last day", () => {
    const c = only(detectCollisions([d("2026-11-10"), d("2026-11-12"), d("2026-11-14")]));
    expect([c.start, c.end]).toEqual(["2026-11-10", "2026-11-14"]);
    expect(c.deadline_count).toBe(3);
    expect(c.total_weight_pct).toBe(30);
  });

  it("three deadlines spread over six days is not a collision", () => {
    expect(detectCollisions([d("2026-11-10"), d("2026-11-12"), d("2026-11-15")])).toEqual([]);
  });

  it("heavy weight alone triggers a collision", () => {
    const c = only(detectCollisions([d("2026-11-10", 25), d("2026-11-13", 15)]));
    expect(c.deadline_count).toBe(2);
    expect(c.total_weight_pct).toBe(40);
  });

  it("weight just below the threshold", () => {
    expect(detectCollisions([d("2026-11-10", 25), d("2026-11-13", 14.5)])).toEqual([]);
  });

  it("null weight counts toward the count but not the weight", () => {
    const c = only(
      detectCollisions([d("2026-11-10", null), d("2026-11-11", null), d("2026-11-12", 20)]),
    );
    expect(c.deadline_count).toBe(3);
    expect(c.total_weight_pct).toBe(20);
  });

  it("null weights never trigger the weight rule", () => {
    expect(detectCollisions([d("2026-11-10", null), d("2026-11-11", 39)])).toEqual([]);
  });

  it("overlapping windows merge", () => {
    const deadlines = [
      d("2026-11-10"),
      d("2026-11-11"),
      d("2026-11-12"),
      d("2026-11-15"),
      d("2026-11-16"),
    ];
    const c = only(detectCollisions(deadlines));
    expect([c.start, c.end]).toEqual(["2026-11-10", "2026-11-16"]);
    expect(c.deadline_count).toBe(5);
    expect(c.deadlines.map((x) => x.id)).toEqual(deadlines.map((x) => x.id).sort((a, b) => a - b));
  });

  it("separate collisions stay separate", () => {
    const week5 = [d("2026-10-05"), d("2026-10-06"), d("2026-10-07")];
    const week9 = [d("2026-11-09", 20), d("2026-11-10", 25), d("2026-11-12", 10)];
    const cs = detectCollisions([...week9, ...week5]);
    expect(cs.map((c) => c.start)).toEqual(["2026-10-05", "2026-11-09"]);
    expect(cs[1]!.total_weight_pct).toBe(55);
  });

  it("same-day deadlines", () => {
    expect(
      only(detectCollisions([d("2026-11-10"), d("2026-11-10"), d("2026-11-10")])).deadline_count,
    ).toBe(3);
  });

  it("mixed courses for a student's course combination", () => {
    const deadlines = [
      d("2026-11-09", 10, undefined, 1),
      d("2026-11-10", 10, undefined, 2),
      d("2026-11-11", 10, undefined, 3),
    ];
    expect(only(detectCollisions(deadlines)).deadline_count).toBe(3);
  });
});

describe("repCollisions (backend parity)", () => {
  it("peak includes the 3-day lookback and ignores days outside", () => {
    const deadlines = [d("2026-11-09", 20), d("2026-11-10", 25), d("2026-11-12", 10)];
    const daily = [
      { date: "2026-11-05", avg_stress: 9.9 }, // 4 days before start: outside lookback
      { date: "2026-11-06", avg_stress: 6.0 }, // 3 days before start: inside
      { date: "2026-11-08", avg_stress: 8.1 },
      { date: "2026-11-11", avg_stress: 7.5 },
      { date: "2026-11-14", avg_stress: 9.5 }, // after window end: outside
    ];
    const c = only(repCollisions(deadlines, daily));
    expect(c.peak_avg_stress).toBe(8.1);
    expect(c.peak_date).toBe("2026-11-08");
  });

  it("a tie goes to the earliest day", () => {
    const deadlines = [d("2026-11-09"), d("2026-11-10"), d("2026-11-11")];
    const daily = [
      { date: "2026-11-10", avg_stress: 7.0 },
      { date: "2026-11-08", avg_stress: 7.0 },
    ];
    expect(only(repCollisions(deadlines, daily)).peak_date).toBe("2026-11-08");
  });

  it("no stress data gives null peaks", () => {
    const c = only(repCollisions([d("2026-11-09"), d("2026-11-10"), d("2026-11-11")], []));
    expect(c.peak_avg_stress).toBeNull();
    expect(c.peak_date).toBeNull();
  });
});

describe("headsUp (backend parity)", () => {
  it("only returns upcoming windows", () => {
    const past = [d("2026-10-01"), d("2026-10-02"), d("2026-10-03")];
    const soon = [d("2026-11-16"), d("2026-11-17"), d("2026-11-18")];
    const later = [d("2026-12-10"), d("2026-12-11"), d("2026-12-12")];
    expect(headsUp([...past, ...soon, ...later], "2026-11-07").map((c) => c.start)).toEqual([
      "2026-11-16",
    ]);
  });

  it("includes a window already in progress", () => {
    const c = only(headsUp([d("2026-11-05"), d("2026-11-07"), d("2026-11-08")], "2026-11-07"));
    expect(c.start).toBe("2026-11-05");
  });

  it("the horizon is fourteen days, today included", () => {
    expect(headsUp([d("2026-11-20"), d("2026-11-21"), d("2026-11-22")], "2026-11-07")).toHaveLength(
      1,
    );
    expect(headsUp([d("2026-11-21"), d("2026-11-22"), d("2026-11-23")], "2026-11-07")).toEqual([]);
  });

  it("message with known weights", () => {
    const c = only(
      detectCollisions([
        d("2026-11-09", 20, "Midterm 2"),
        d("2026-11-10", 25, "Project Phase 3"),
        d("2026-11-12", 10, "Quiz 4"),
      ]),
    );
    expect(headsUpMessage(c)).toBe(
      "3 assessments worth 55% in 5 days. Start Project Phase 3 early.",
    );
  });

  it("message with an unknown weight says 'at least'", () => {
    const c = only(
      detectCollisions([d("2026-11-09", 30, "Lab"), d("2026-11-10", null), d("2026-11-11", 15)]),
    );
    expect(headsUpMessage(c).startsWith("3 assessments worth at least 45% in 5 days.")).toBe(true);
  });

  it("message with no known weights", () => {
    const c = only(
      detectCollisions([d("2026-11-09", null, "A"), d("2026-11-10", null), d("2026-11-11", null)]),
    );
    expect(headsUpMessage(c)).toBe("3 assessments in 5 days. Start A early.");
  });
});

describe("heads-up nudge (backend parity)", () => {
  const week9 = () => [
    d("2026-11-03", 20, "Midterm 2", 1),
    d("2026-11-05", 25, "Midterm 2", 2),
    d("2026-11-07", 10, "Quiz 4", 1),
  ];
  const codes = new Map([
    [1, "CPSC 210"],
    [2, "MATH 200"],
  ]);

  it("skips deadlines already past", () => {
    const c = only(detectCollisions(week9()));
    expect(headsUpMessage(c, "2026-11-07", codes)).toBe(
      "3 assessments worth 55% in 5 days. Start CPSC 210 Quiz 4 early.",
    );
  });

  it("includes deadlines due today", () => {
    const c = only(detectCollisions(week9()));
    expect(headsUpMessage(c, "2026-11-05", codes).endsWith("Start MATH 200 Midterm 2 early.")).toBe(
      true,
    );
  });

  it("leaves the nudge out when everything is past", () => {
    const c = only(detectCollisions(week9()));
    expect(headsUpMessage(c, "2026-11-08", codes)).toBe("3 assessments worth 55% in 5 days.");
  });

  it("falls back to the title without course codes", () => {
    const c = only(detectCollisions(week9()));
    expect(headsUpMessage(c, "2026-11-07").endsWith("Start Quiz 4 early.")).toBe(true);
  });

  it("headsUp passes today and codes", () => {
    const c = only(headsUp(week9(), "2026-11-07", codes));
    expect(c.message.endsWith("Start CPSC 210 Quiz 4 early.")).toBe(true);
  });
});

describe("weight rule needs a pile-up (backend parity)", () => {
  it("a single heavy final is not a collision", () => {
    expect(detectCollisions([d("2026-12-14", 50, "Final Exam")])).toEqual([]);
    expect(detectCollisions([d("2026-12-14", 100, "Final Exam")])).toEqual([]);
  });

  it("two assessments reaching the weight threshold still collide", () => {
    const c = only(detectCollisions([d("2026-12-10", 20), d("2026-12-12", 20)]));
    expect([c.deadline_count, c.total_weight_pct]).toEqual([2, 40]);
  });

  it("a lone heavy final no longer stretches a window", () => {
    const finals = [
      d("2026-12-10", 20, undefined, 1),
      d("2026-12-12", 35, undefined, 3),
      d("2026-12-14", 40, undefined, 2),
    ];
    const c = only(detectCollisions(finals));
    expect([c.start, c.end]).toEqual(["2026-12-10", "2026-12-16"]);
  });

  it("a lone heavy assessment gives no heads-up", () => {
    expect(headsUp([d("2026-11-10", 45, "Research Essay")], "2026-11-07")).toEqual([]);
  });

  it("a lone heavy assessment is not a rep pile-up", () => {
    const students = Array.from({ length: 20 }, () => [1]);
    expect(
      crossCourseRepCollisions(1, [d("2026-12-04", 40, "Research Essay", 1)], students, [], 5),
    ).toEqual([]);
  });
});
