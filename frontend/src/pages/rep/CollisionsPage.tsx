import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";

import { api, qk } from "@/api/client";
import { CollisionCard } from "@/components/CollisionCard";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/StateViews";
import { useCourseMap } from "@/components/useCourseMap";
import { WithCourse } from "./PickCourse";

function Collisions({ courseId }: { courseId: number }) {
  const courses = useCourseMap();
  const q = useQuery({
    queryKey: qk.collisions(courseId),
    queryFn: () => api.getCollisions(courseId),
  });
  const code = courses.get(courseId)?.code;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={code ? `${code} · Pile-ups` : "Pile-ups"}
        title="Where deadlines collide"
        description="Stretches where several big assessments land within a few days, and how stressed the class got around them."
      />
      {q.isPending ? (
        <LoadingBlock rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.collisions.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No pile-ups this term">
          Deadlines for this class are nicely spread out.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.collisions.map((c) => (
            <CollisionCard
              key={c.start}
              start={c.start}
              end={c.end}
              deadlineCount={c.deadline_count}
              totalWeight={c.total_weight_pct}
              deadlines={c.deadlines}
              courses={courses}
              peak={{ value: c.peak_avg_stress, date: c.peak_date }}
              byCourse
              affected={{ students: c.students_affected, cohortSize: q.data.cohort_size }}
              ownCourseId={courseId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CollisionsPage() {
  return <WithCourse>{(id) => <Collisions courseId={id} />}</WithCourse>;
}
