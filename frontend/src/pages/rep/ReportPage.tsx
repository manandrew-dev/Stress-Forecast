import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileBarChart, Flame, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api, qk } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/StateViews";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCourseMap } from "@/components/useCourseMap";
import { ApiError } from "@/api/errors";
import { addDays, rangeLabel, weekStartOf } from "@/lib/dates";
import { WithCourse } from "./PickCourse";

/** What the API puts in top_cause when a week has too few check-ins for a report. */
const NOT_ENOUGH_DATA = "not enough data";

/** Errors that will fail the same way if we ask again; each retry costs a Gemini call. */
const NO_RETRY_STATUSES = new Set([404, 422, 429, 503]);

function shouldRetryReport(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.code === "ai_parse_failed" || NO_RETRY_STATUSES.has(error.status)) return false;
  }
  return failureCount < 2;
}

function Report({ courseId }: { courseId: number }) {
  const courses = useCourseMap();
  // The cohort timeline tells us which weeks have data.
  const cohort = useQuery({
    queryKey: qk.cohort(courseId),
    queryFn: () => api.getCohort(courseId),
  });
  const weeks = useMemo(() => {
    const days = cohort.data?.days ?? [];
    const first = days[0];
    const last = days.at(-1);
    if (!first || !last) return [];
    const out: string[] = [];
    for (let w = weekStartOf(first.date); w <= last.date; w = addDays(w, 7)) out.push(w);
    return out.reverse();
  }, [cohort.data]);

  const [week, setWeek] = useState<string | null>(null);
  useEffect(() => {
    if (weeks.length && (!week || !weeks.includes(week))) setWeek(weeks[0] ?? null);
  }, [weeks, week]);

  const report = useQuery({
    queryKey: qk.report(courseId, week ?? ""),
    queryFn: () => api.getReport(courseId, week!),
    enabled: !!week,
    // Gemini's free quota is small: a week's report is fetched once and reused.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: shouldRetryReport,
  });

  const idx = week ? weeks.indexOf(week) : -1;
  const weekNo = (w: string) => weeks.length - weeks.indexOf(w);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${courses.get(courseId)?.code ?? ""} · Weekly report`}
        title="What happened this week"
      />

      {cohort.isPending ? (
        <LoadingBlock rows={2} />
      ) : cohort.isError ? (
        <ErrorState error={cohort.error} onRetry={() => cohort.refetch()} />
      ) : weeks.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No report yet">
          There aren't enough check-ins for this course yet.
        </EmptyState>
      ) : !week ? (
        <LoadingBlock rows={2} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous week"
              disabled={idx >= weeks.length - 1}
              onClick={() => setWeek(weeks[idx + 1] ?? week)}
            >
              <ChevronLeft />
            </Button>
            <Select value={week} onValueChange={setWeek}>
              <SelectTrigger
                className="h-10 flex-1 rounded-full bg-card sm:max-w-72"
                aria-label="Week"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((w) => (
                  <SelectItem key={w} value={w}>
                    Week {weekNo(w)} · {rangeLabel(w, addDays(w, 6))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next week"
              disabled={idx <= 0}
              onClick={() => setWeek(weeks[idx - 1] ?? week)}
            >
              <ChevronRight />
            </Button>
          </div>

          {report.isPending ? (
            <LoadingBlock rows={2} />
          ) : report.isError ? (
            report.error instanceof ApiError && report.error.status === 404 ? (
              <EmptyState icon={FileBarChart} title="No report yet">
                {report.error.message}
              </EmptyState>
            ) : (
              <ErrorState error={report.error} onRetry={() => report.refetch()} />
            )
          ) : report.data.top_cause === NOT_ENOUGH_DATA ? (
            // The real API answers 200 with this marker instead of a 404 (docs/api.md).
            <EmptyState icon={FileBarChart} title="No report yet">
              {report.data.summary || "There aren't enough check-ins for this week yet."}
            </EmptyState>
          ) : (
            <Card className="animate-rise overflow-hidden" key={report.data.week_start}>
              <div className="p-5 sm:p-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Summary
                </p>
                <p className="text-lg leading-relaxed">{report.data.summary}</p>
              </div>
              <div className="grid border-t sm:grid-cols-2">
                <div className="flex gap-3 p-5 sm:border-r sm:p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-deadline-soft">
                    <Flame className="size-5 text-deadline-foreground" />
                  </span>
                  <div>
                    <p className="text-sm text-muted-foreground">Top cause</p>
                    <p className="font-display text-lg font-semibold">{report.data.top_cause}</p>
                  </div>
                </div>
                <div className="flex gap-3 border-t bg-primary-soft/60 p-5 sm:border-t-0 sm:p-6">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary">
                    <Wrench className="size-5 text-primary-foreground" />
                  </span>
                  <div>
                    <p className="text-sm text-muted-foreground">Suggested fix</p>
                    <p className="leading-relaxed">{report.data.suggested_fix}</p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function ReportPage() {
  return <WithCourse>{(id) => <Report courseId={id} />}</WithCourse>;
}
