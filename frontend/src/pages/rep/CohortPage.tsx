import { useEffect, useMemo, useState } from "react";
import "./CohortPage.css";

type Course = {
  id: number;
  code: string;
  name: string;
  term: string;
};

type Deadline = {
  id: number;
  course_id: number;
  title: string;
  due_date: string;
  weight_pct: number | null;
  type: "exam" | "midterm" | "quiz" | "assignment" | "project" | "other";
};

type CohortDay =
  | { date: string; avg_stress: number; n_students: number; suppressed: false }
  | { date: string; avg_stress: null; n_students: null; suppressed: true };

type CohortResponse = {
  course: Course;
  min_students: number;
  days: CohortDay[];
  deadlines: Deadline[];
};

type CohortPageProps = {
  /** Courses should come from GET /me, which returns only courses assigned to this rep. */
  courses: Course[];
  /** API adapter for GET /courses/{course_id}/cohort. Keep fetch in src/api. */
  loadCohort: (courseId: number) => Promise<CohortResponse>;
};

const CHART_HEIGHT = 300;
const CHART_TOP = 28;
const CHART_BOTTOM = 222;
const CHART_LEFT = 54;
const CHART_RIGHT = 28;
const MIN_CHART_WIDTH = 760;
const DAY_WIDTH = 32;
const STRESS_TICKS = [2, 4, 6, 8, 10];

function dateValue(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function displayDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(dateValue(date)));
}

function stressY(stress: number): number {
  return CHART_BOTTOM - ((stress - 1) / 9) * (CHART_BOTTOM - CHART_TOP);
}

function buildSegments(days: CohortDay[], xForDate: (date: string) => number): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  let previousDate: number | null = null;

  for (const day of days) {
    if (day.suppressed) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      previousDate = null;
      continue;
    }

    const currentDate = dateValue(day.date);
    if (previousDate !== null && currentDate - previousDate > 86_400_000) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    }

    const point = `${xForDate(day.date)},${stressY(day.avg_stress)}`;
    current.push(`${current.length ? "L" : "M"} ${point}`);
    previousDate = currentDate;
  }

  if (current.length) segments.push(current.join(" "));
  return segments;
}

export default function CohortPage({ courses, loadCohort }: CohortPageProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(courses[0]?.id ?? null);
  const [cohort, setCohort] = useState<CohortResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (courses.length === 0) {
      setSelectedCourseId(null);
      setCohort(null);
      setLoading(false);
      setError(null);
      return;
    }

    if (!courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  useEffect(() => {
    if (selectedCourseId === null || !courses.some((course) => course.id === selectedCourseId)) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setCohort(null);

    loadCohort(selectedCourseId)
      .then((response) => {
        if (!cancelled) setCohort(response);
      })
      .catch(() => {
        if (!cancelled) setError("We couldn’t load this course’s cohort data. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courses, loadCohort, reloadKey, selectedCourseId]);

  const chart = useMemo(() => {
    if (!cohort || (cohort.days.length === 0 && cohort.deadlines.length === 0)) return null;

    const days = [...cohort.days].sort((a, b) => dateValue(a.date) - dateValue(b.date));
    const deadlines = [...cohort.deadlines].sort((a, b) => dateValue(a.due_date) - dateValue(b.due_date));
    const allDates = [...days.map((day) => day.date), ...deadlines.map((deadline) => deadline.due_date)];
    const firstDate = Math.min(...allDates.map(dateValue));
    const lastDate = Math.max(...allDates.map(dateValue));
    const spanDays = Math.max(1, Math.round((lastDate - firstDate) / 86_400_000));
    const width = Math.max(MIN_CHART_WIDTH, CHART_LEFT + CHART_RIGHT + (spanDays + 1) * DAY_WIDTH);
    const xForDate = (date: string) => CHART_LEFT + ((dateValue(date) - firstDate) / (lastDate - firstDate || 1)) * (width - CHART_LEFT - CHART_RIGHT);
    const tickInterval = Math.max(1, Math.ceil(days.length / 9));
    const tickDays = days.filter((_, index) => index % tickInterval === 0 || index === days.length - 1);

    return {
      days,
      deadlines,
      width,
      xForDate,
      tickDays,
      segments: buildSegments(days, xForDate),
    };
  }, [cohort]);

  return (
    <main className="cohort-page">
      <header className="cohort-page__header">
        <div>
          <p className="cohort-page__eyebrow">REP DASHBOARD</p>
          <h1>Cohort stress</h1>
          <p className="cohort-page__intro">See how course deadlines line up with the cohort’s daily stress.</p>
        </div>
        <label className="cohort-page__course-field">
          <span>Course</span>
          <select
            aria-label="Choose a course"
            value={selectedCourseId ?? ""}
            disabled={courses.length === 0}
            onChange={(event) => setSelectedCourseId(Number(event.target.value))}
          >
            {courses.length === 0 ? <option value="">No assigned courses</option> : null}
            {courses.map((course) => (
              <option value={course.id} key={course.id}>
                {course.code} · {course.term}
              </option>
            ))}
          </select>
        </label>
      </header>

      {courses.length === 0 ? (
        <section className="cohort-page__message" role="status">
          <h2>No courses assigned</h2>
          <p>Your assigned courses will appear here when they’re available.</p>
        </section>
      ) : null}

      {loading ? (
        <section className="cohort-page__message" role="status" aria-live="polite">
          <span className="cohort-page__spinner" aria-hidden="true" />
          <p>Loading cohort data…</p>
        </section>
      ) : null}

      {error ? (
        <section className="cohort-page__message cohort-page__message--error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </section>
      ) : null}

      {!loading && !error && cohort && chart ? (
        <>
          <section className="cohort-page__summary" aria-label="Course details">
            <div>
              <p className="cohort-page__eyebrow">COURSE</p>
              <h2>{cohort.course.name}</h2>
              <p>{cohort.course.code} · {cohort.course.term}</p>
            </div>
            <div className="cohort-page__privacy">
              <span className="cohort-page__privacy-icon" aria-hidden="true">✓</span>
              <span>Only group data is shown. Days below {cohort.min_students} responses are hidden.</span>
            </div>
          </section>

          <section className="cohort-page__card" aria-labelledby="stress-chart-title">
            <div className="cohort-page__card-heading">
              <div>
                <p className="cohort-page__eyebrow">TERM OVERVIEW</p>
                <h2 id="stress-chart-title">Daily average stress</h2>
              </div>
              <div className="cohort-page__legend" aria-label="Chart legend">
                <span><i className="cohort-page__legend-line" /> Average stress</span>
                <span><i className="cohort-page__legend-deadline" /> Course deadline</span>
              </div>
            </div>

            {chart.days.length === 0 ? (
              <p className="cohort-page__chart-empty">No check-in data yet. Course deadlines are shown for context.</p>
            ) : null}

            <div className="cohort-page__chart-scroll" role="region" aria-label="Scrollable stress timeline">
              <svg
                className="cohort-page__chart"
                viewBox={`0 0 ${chart.width} ${CHART_HEIGHT}`}
                width={chart.width}
                role="img"
                aria-labelledby="stress-chart-title stress-chart-description"
              >
                <desc id="stress-chart-description">
                  Daily cohort average stress from 1 to 10. Deadline markers share the timeline. Suppressed days are gaps and are not connected.
                </desc>

                {STRESS_TICKS.map((tick) => {
                  const y = stressY(tick);
                  return (
                    <g key={tick}>
                      <line className="cohort-page__grid-line" x1={CHART_LEFT} x2={chart.width - CHART_RIGHT} y1={y} y2={y} />
                      <text className="cohort-page__axis-label" x={CHART_LEFT - 12} y={y + 4} textAnchor="end">{tick}</text>
                    </g>
                  );
                })}

                {chart.deadlines.map((deadline, index) => {
                  const x = chart.xForDate(deadline.due_date);
                  return (
                    <g key={deadline.id}>
                      <line className="cohort-page__deadline-line" x1={x} x2={x} y1={CHART_TOP} y2={CHART_BOTTOM + 20} />
                      <circle className="cohort-page__deadline-dot" cx={x} cy={CHART_TOP} r="4" />
                      <text className="cohort-page__deadline-index" x={x} y={CHART_TOP - 9 - (index % 2) * 12} textAnchor="middle">D{index + 1}</text>
                    </g>
                  );
                })}

                {chart.segments.map((segment, index) => (
                  <path className="cohort-page__stress-line" d={segment} key={index} />
                ))}

                {chart.days.filter((day) => !day.suppressed).map((day) => (
                  <circle
                    className="cohort-page__stress-point"
                    cx={chart.xForDate(day.date)}
                    cy={stressY(day.avg_stress)}
                    r="4"
                    key={day.date}
                  >
                    <title>{`${displayDate(day.date)}: average stress ${day.avg_stress.toFixed(1)} from ${day.n_students} students`}</title>
                  </circle>
                ))}

                {chart.days.filter((day) => day.suppressed).map((day) => (
                  <g key={day.date}>
                    <line className="cohort-page__suppressed-mark" x1={chart.xForDate(day.date)} x2={chart.xForDate(day.date)} y1={CHART_TOP} y2={CHART_BOTTOM + 20} />
                    <title>{`${displayDate(day.date)}: Not enough responses`}</title>
                  </g>
                ))}

                {chart.tickDays.map((day) => (
                  <text className="cohort-page__axis-label" x={chart.xForDate(day.date)} y={CHART_BOTTOM + 42} textAnchor="middle" key={day.date}>
                    {displayDate(day.date)}
                  </text>
                ))}
              </svg>
            </div>

            <ul className="cohort-page__deadline-list" aria-label="Course deadlines on the timeline">
              {chart.deadlines.length ? chart.deadlines.map((deadline, index) => (
                <li key={deadline.id}>
                  <span className="cohort-page__deadline-tag">D{index + 1}</span>
                  <span><strong>{deadline.title}</strong><small>{displayDate(deadline.due_date, { year: "numeric" })}</small></span>
                  {deadline.weight_pct !== null ? <span className="cohort-page__deadline-weight">{deadline.weight_pct}%</span> : null}
                </li>
              )) : <li className="cohort-page__empty-deadlines">No deadlines have been added for this course.</li>}
            </ul>
          </section>

          {chart.days.some((day) => day.suppressed) ? (
            <section className="cohort-page__suppression" aria-label="Suppressed cohort days">
              <p className="cohort-page__suppression-note" role="note">
                <span className="cohort-page__suppression-swatch" aria-hidden="true" />
                Values below the privacy threshold are hidden, and the line is left open across those dates.
              </p>
              <ul className="cohort-page__suppression-days">
                {chart.days.filter((day) => day.suppressed).map((day) => (
                  <li key={day.date}>
                    <time dateTime={day.date}>{displayDate(day.date, { year: "numeric" })}</time>
                    <span>Not enough responses</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {!loading && !error && cohort && !chart ? (
        <section className="cohort-page__message" role="status">
          <h2>No check-in data yet</h2>
          <p>Daily cohort trends will appear here as students check in.</p>
        </section>
      ) : null}
    </main>
  );
}
