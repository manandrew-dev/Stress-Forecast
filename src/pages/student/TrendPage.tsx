import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LineChart } from "lucide-react";
import { useMemo } from "react";

import { api, qk } from "@/api/client";
import { useAuth } from "@/auth/useAuth";
import { ChartLegend, TimelineChart } from "@/components/charts/TimelineChart";
import { DeadlineRow } from "@/components/DeadlineRow";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/StateViews";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCourseMap } from "@/components/useCourseMap";
import { deadlineMarks, fillTimeline, trendToPoints } from "@/lib/chart-series";
import { addDays, diffDays } from "@/lib/dates";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-3 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function TrendPage() {
  const { user } = useAuth();
  const courses = useCourseMap();
  const q = useQuery({ queryKey: qk.trend(user?.id ?? "anon"), queryFn: api.getMyTrend });

  const chart = useMemo(() => {
    const first = q.data?.points[0];
    const lastPoint = q.data?.points.at(-1);
    if (!q.data || !first || !lastPoint) return null;
    const { points, deadlines } = q.data;
    const sortedDue = deadlines.map((d) => d.due_date).sort();
    const firstDue = sortedDue[0] ?? first.date;
    const origin = firstDue < first.date ? firstDue : first.date;
    const today = lastPoint.date;
    const lastDue = sortedDue.at(-1) ?? today;
    const end = lastDue > today ? lastDue : today;
    const last7 = points.filter((p) => p.date > addDays(today, -7));
    const sleeps = last7.map((p) => p.sleep_hours).filter((s): s is number => s !== null);
    return {
      origin,
      rows: fillTimeline(trendToPoints(points), origin, end),
      marks: deadlineMarks(deadlines, origin, end),
      todayX: diffDays(today, origin),
      avg7: last7.reduce((s, p) => s + p.stress, 0) / Math.max(1, last7.length),
      sleep7: sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null,
      checkins: points.length,
      upcoming: deadlines.filter((d) => d.due_date > today).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 4),
    };
  }, [q.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My trend"
        title="Your stress, with your deadlines"
        description="Each dot is a check-in. The orange markers are your deadlines — bigger means more of your grade."
      />
      {q.isPending ? (
        <LoadingBlock rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !chart ? (
        <EmptyState
          icon={LineChart}
          title="No check-ins yet"
          action={
            <Button asChild>
              <Link to="/student/check-in">Do your first check-in</Link>
            </Button>
          }
        >
          Your trend appears after your first check-in.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Avg stress, last 7 days" value={chart.avg7.toFixed(1)} />
            <Stat label="Avg sleep, last 7 days" value={chart.sleep7 === null ? "—" : `${chart.sleep7.toFixed(1)}h`} />
            <Stat label="Check-ins" value={String(chart.checkins)} />
          </div>
          <Card className="p-4 sm:p-6">
            <TimelineChart
              rows={chart.rows}
              origin={chart.origin}
              marks={chart.marks}
              connectGaps
              courses={courses}
              todayX={chart.todayX}
              valueLabel="Stress"
              ariaLabel="Line chart of your daily stress with your deadlines marked"
            />
            <ChartLegend
              items={[
                { swatch: "line", label: "My stress (1–10)" },
                { swatch: "deadline", label: "Deadline" },
              ]}
            />
          </Card>
          {chart.upcoming.length > 0 && (
            <Card className="p-4 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold">Coming up</h2>
              <ul className="divide-y">
                {chart.upcoming.map((d) => (
                  <DeadlineRow key={d.id} deadline={d} course={courses.get(d.course_id)} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
