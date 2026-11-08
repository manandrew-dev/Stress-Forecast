import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";

import { api, qk } from "@/api/client";
import type { Deadline } from "@/api/types";
import { useAuth } from "@/auth/useAuth";
import { DeadlineRow } from "@/components/DeadlineRow";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/StateViews";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCourseMap } from "@/components/useCourseMap";
import { diffDays, longDate, relativeDay, todayLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Groups deadlines by due date, keeping the given order. */
function byDay(deadlines: Deadline[]): [string, Deadline[]][] {
  const out = new Map<string, Deadline[]>();
  for (const d of deadlines) out.set(d.due_date, [...(out.get(d.due_date) ?? []), d]);
  return [...out.entries()];
}

function DaySection({
  day,
  deadlines,
  today,
  courses,
}: {
  day: string;
  deadlines: Deadline[];
  today: string;
  courses: ReturnType<typeof useCourseMap>;
}) {
  return (
    <div>
      <p className="flex items-baseline gap-2 pt-3 text-sm">
        <span className="font-semibold">{longDate(day)}</span>
        <span className="text-muted-foreground">{relativeDay(day, today)}</span>
      </p>
      <ul className="divide-y">
        {deadlines.map((d) => (
          <DeadlineRow key={d.id} deadline={d} course={courses.get(d.course_id)} />
        ))}
      </ul>
    </div>
  );
}

function Group({
  title,
  deadlines,
  today,
  courses,
}: {
  title: string;
  deadlines: Deadline[];
  today: string;
  courses: ReturnType<typeof useCourseMap>;
}) {
  if (deadlines.length === 0) return null;
  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="divide-y">
        {byDay(deadlines).map(([day, ds]) => (
          <DaySection key={day} day={day} deadlines={ds} today={today} courses={courses} />
        ))}
      </div>
    </Card>
  );
}

export function DeadlinesPage() {
  const { user } = useAuth();
  const courses = useCourseMap();
  // Same request as the trend page (no range = every deadline for my courses), so it's cached.
  const q = useQuery({ queryKey: qk.trend(user?.id ?? "anon"), queryFn: () => api.getMyTrend() });
  const [course, setCourse] = useState<number | null>(null);
  const [showPast, setShowPast] = useState(false);
  const today = todayLocal();

  const view = useMemo(() => {
    const all = [...(q.data?.deadlines ?? [])].sort(
      (a, b) => a.due_date.localeCompare(b.due_date) || a.course_id - b.course_id,
    );
    const courseIds = [...new Set(all.map((d) => d.course_id))];
    const shown = course === null ? all : all.filter((d) => d.course_id === course);
    const upcoming = shown.filter((d) => d.due_date >= today);
    const week = upcoming.filter((d) => diffDays(d.due_date, today) < 7);
    const later = upcoming.filter((d) => diffDays(d.due_date, today) >= 7);
    const past = shown.filter((d) => d.due_date < today).reverse();
    // Weight is a share of each course's own grade, so it only adds up within one course.
    const aheadByCourse = new Map<number, number>();
    for (const d of upcoming) {
      if (d.weight_pct !== null)
        aheadByCourse.set(d.course_id, (aheadByCourse.get(d.course_id) ?? 0) + d.weight_pct);
    }
    const weightAhead = [...aheadByCourse.entries()].map(([courseId, weight]) => ({
      courseId,
      weight,
    }));
    return { all, courseIds, upcoming, week, later, past, weightAhead };
  }, [q.data, course, today]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Deadlines"
        title="All your deadlines"
        description="Every deadline from your courses, soonest first."
      />
      {q.isPending ? (
        <LoadingBlock rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : view.all.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No deadlines yet"
          action={
            <Button asChild>
              <Link to="/student/syllabus">Upload a syllabus</Link>
            </Button>
          }
        >
          Upload a syllabus and its deadlines show up here.
        </EmptyState>
      ) : (
        <>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Filter by course"
          >
            {[null, ...view.courseIds].map((id) => {
              const active = course === id;
              return (
                <button
                  key={id ?? "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCourse(id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary bg-primary-soft text-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent",
                  )}
                >
                  {id === null ? "All courses" : (courses.get(id)?.code ?? "Course")}
                </button>
              );
            })}
          </div>

          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">{view.upcoming.length}</strong>{" "}
            upcoming
            {course !== null && view.weightAhead.length === 1 ? (
              <>
                {" · "}
                <strong className="font-semibold text-foreground">
                  {view.weightAhead[0]!.weight}%
                </strong>{" "}
                of {courses.get(course)?.code ?? "this course"}&rsquo;s grade still ahead
              </>
            ) : (
              view.weightAhead.length > 0 && (
                <>
                  {" · still ahead: "}
                  {view.weightAhead.map(({ courseId, weight }, i) => (
                    <span key={courseId}>
                      {i > 0 && " · "}
                      {courses.get(courseId)?.code ?? "Course"}{" "}
                      <strong className="font-semibold text-foreground">{weight}%</strong>
                    </span>
                  ))}
                </>
              )
            )}
          </p>

          {view.upcoming.length === 0 && (
            <EmptyState icon={CalendarDays} title="Nothing left to hand in">
              Every deadline here is behind you.
            </EmptyState>
          )}
          <Group title="Next 7 days" deadlines={view.week} today={today} courses={courses} />
          <Group title="Later this term" deadlines={view.later} today={today} courses={courses} />

          {view.past.length > 0 && (
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPast((s) => !s)}
                aria-expanded={showPast}
              >
                {showPast ? <ChevronUp /> : <ChevronDown />}
                {showPast ? "Hide" : "Show"} {view.past.length} past{" "}
                {view.past.length === 1 ? "deadline" : "deadlines"}
              </Button>
              {showPast && (
                <Group title="Past" deadlines={view.past} today={today} courses={courses} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
