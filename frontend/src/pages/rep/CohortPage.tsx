import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { useMemo } from "react";

import { api, qk } from "@/api/client";
import type { CohortResponse } from "@/api/types";
import { ChartLegend, TimelineChart } from "@/components/charts/TimelineChart";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/StateViews";
import { Card } from "@/components/ui/card";
import { useCourseMap } from "@/components/useCourseMap";
import { deadlineMarks, fillTimeline, suppressedRanges, toCohortSeries } from "@/lib/chart-series";
import { diffDays, shortDate } from "@/lib/dates";
import { WithCourse } from "./PickCourse";

function CohortView({ data }: { data: CohortResponse }) {
  const courses = useCourseMap();
  const view = useMemo(() => {
    const origin = data.days[0]?.date ?? data.deadlines[0]?.due_date ?? "";
    const today = data.days.at(-1)?.date ?? origin;
    const lastDue = data.deadlines.map((d) => d.due_date).sort().at(-1) ?? today;
    const end = lastDue > today ? lastDue : today;
    const series = toCohortSeries(data.days, origin);
    const visible = series.filter((p) => p.value !== null);
    const peak = visible.reduce<(typeof visible)[number] | null>(
      (b, p) => (b && (b.value ?? 0) >= (p.value ?? 0) ? b : p),
      null,
    );
    return {
      origin,
      rows: fillTimeline(series, origin, end),
      gaps: suppressedRanges(series),
      marks: deadlineMarks(data.deadlines, origin, end),
      todayX: diffDays(today, origin),
      avg: visible.reduce((s, p) => s + (p.value ?? 0), 0) / Math.max(1, visible.length),
      peak,
      suppressedCount: series.filter((p) => p.suppressed).length,
    };
  }, [data]);

  // Nothing to plot yet (no days, or every day under the 5-student minimum).
  if (view.peak === null) {
    return (
      <EmptyState icon={LineChart} title="No check-in data yet">
        The class average shows up once at least {data.min_students} students have checked in on the
        same day.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-card px-4 py-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Term average</p>
          <p className="font-display text-2xl font-semibold">{view.avg.toFixed(1)}</p>
        </div>
        <div className="rounded-2xl border bg-card px-4 py-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Highest day</p>
          <p className="font-display text-2xl font-semibold">
            {view.peak ? `${view.peak.value}` : "—"}
            {view.peak && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{shortDate(view.peak.date)}</span>}
          </p>
        </div>
        <div className="rounded-2xl border bg-card px-4 py-3 shadow-soft">
          <p className="text-xs text-muted-foreground">Hidden days</p>
          <p className="font-display text-2xl font-semibold">{view.suppressedCount}</p>
        </div>
      </div>
      <Card className="p-4 sm:p-6">
        <TimelineChart
          rows={view.rows}
          origin={view.origin}
          marks={view.marks}
          gaps={view.gaps}
          connectGaps={false}
          courses={courses}
          highlightCourseId={data.course.id}
          todayX={view.todayX}
          valueLabel="Class average"
          minStudents={data.min_students}
          ariaLabel={`Line chart of daily average stress for ${data.course.code}, with all course deadlines marked`}
        />
        <ChartLegend
          items={[
            { swatch: "line", label: "Daily average stress" },
            { swatch: "deadline-strong", label: `${data.course.code} deadline` },
            // Only when the chart actually has other courses' deadlines (none with per-course data).
            ...(data.deadlines.some((d) => d.course_id !== data.course.id)
              ? [{ swatch: "deadline" as const, label: "Other courses' deadlines" }]
              : []),
            { swatch: "gap", label: `Not enough responses (under ${data.min_students} students)` },
          ]}
        />
      </Card>
    </>
  );
}

export function CohortPage() {
  return (
    <WithCourse>
      {(courseId) => <CohortForCourse courseId={courseId} />}
    </WithCourse>
  );
}

function CohortForCourse({ courseId }: { courseId: number }) {
  const q = useQuery({ queryKey: qk.cohort(courseId), queryFn: () => api.getCohort(courseId) });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={q.data ? `${q.data.course.code} · ${q.data.course.term}` : "Cohort"}
        title="How the class is feeling"
        description="Daily average stress across the term, with every deadline this class has — including other courses they take."
      />
      {q.isPending ? (
        <LoadingBlock rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <CohortView data={q.data} />
      )}
    </div>
  );
}
