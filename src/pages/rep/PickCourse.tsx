import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useRepCourse } from "./RepCourseContext";

export function PickCourse() {
  const { courses, setCourseId } = useRepCourse();
  return (
    <div>
      <PageHeader
        eyebrow="Class rep"
        title="Which class are you looking at?"
        description="You'll only ever see class-wide averages — never an individual student's check-ins."
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {courses.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setCourseId(c.id)}
              className="group animate-rise flex w-full items-center gap-4 rounded-2xl border bg-card px-5 py-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex-1">
                <p className="font-display text-xl font-semibold">{c.code}</p>
                <p className="text-sm text-muted-foreground">
                  {c.name} · {c.term}
                </p>
              </div>
              <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders the course picker until a course is chosen. */
export function WithCourse({ children }: { children: (courseId: number) => React.ReactNode }) {
  const { courseId } = useRepCourse();
  if (courseId === null) return <PickCourse />;
  return <>{children(courseId)}</>;
}
