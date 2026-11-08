import { useQuery } from "@tanstack/react-query";
import { Database, Lightbulb, Sprout } from "lucide-react";

import { api, qk } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/StateViews";
import { useCourseMap } from "@/components/useCourseMap";
import { addDays, rangeLabel } from "@/lib/dates";
import { WithCourse } from "./PickCourse";

function Insights({ courseId }: { courseId: number }) {
  const courses = useCourseMap();
  const q = useQuery({
    queryKey: qk.insights(courseId),
    queryFn: () => api.getInsights(courseId),
    // Findings only change when the Databricks notebook runs, so the cached page is fresh enough.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${courses.get(courseId)?.code ?? ""} · Insights`}
        title="Patterns worth knowing"
        description="Patterns in class-wide daily averages (days with 5+ students) and deadlines. Databricks never sees individual check-ins."
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Database className="size-3.5" />
        Found by our Databricks analysis of class-wide averages
      </p>
      {q.isPending ? (
        <LoadingBlock rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.insights.length === 0 ? (
        <EmptyState icon={Sprout} title="No insights yet">
          Insights show up once enough students have checked in across a few weeks. Check back soon.
        </EmptyState>
      ) : (
        <ol className="relative space-y-4 border-l-2 border-primary-soft pl-6">
          {q.data.insights.map((i) => (
            <li key={i.week_start + i.finding} className="animate-rise relative">
              <span className="absolute -left-[33px] top-4 flex size-4 items-center justify-center rounded-full bg-primary ring-4 ring-background" />
              <div className="rounded-2xl border bg-card p-5 shadow-soft">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  <Lightbulb className="size-3.5" />
                  Week of {rangeLabel(i.week_start, addDays(i.week_start, 6))}
                </p>
                <p className="leading-relaxed">{i.finding}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function InsightsPage() {
  return <WithCourse>{(id) => <Insights courseId={id} />}</WithCourse>;
}
