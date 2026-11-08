import { Activity, CalendarRange, Users } from "lucide-react";
import type { ReactNode } from "react";

import type { Course, Deadline } from "@/api/types";
import { DeadlineRow } from "@/components/DeadlineRow";
import { StressDot } from "@/components/StressMeter";
import { Card } from "@/components/ui/card";
import { rangeLabel, shortDate } from "@/lib/dates";
import { averageCourseWeight, weightByCourse } from "@/lib/weights";

export function CollisionCard({
  start,
  end,
  deadlineCount,
  totalWeight,
  deadlines,
  courses,
  footer,
  peak,
  today = new Date().toLocaleDateString("en-CA"),
  byCourse = false,
  affected,
  ownCourseId,
}: {
  start: string;
  end: string;
  deadlineCount: number;
  totalWeight: number;
  deadlines: Deadline[];
  courses: Map<number, Course>;
  footer?: ReactNode;
  peak?: { value: number | null; date: string | null };
  /** Local "YYYY-MM-DD"; a pile-up starting on or after it is still ahead. */
  today?: string;
  /**
   * Show each course's share and the average per course instead of one combined
   * total. Weights from different courses don't add up to anything meaningful.
   */
  byCourse?: boolean;
  /** How many of the class this pile-up hits, out of everyone enrolled (rep view). */
  affected?: { students: number; cohortSize: number };
  /** The rep's own course: its deadlines are highlighted, since those are the ones they can ask to move. */
  ownCourseId?: number;
}) {
  return (
    <Card className="animate-rise overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-deadline-soft/60 px-5 py-4">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <CalendarRange className="size-5 text-deadline-foreground" />
          {rangeLabel(start, end)}
        </div>
        <div className="ml-auto flex gap-4 text-sm">
          <span>
            <strong className="font-semibold">{deadlineCount}</strong>{" "}
            <span className="text-muted-foreground">
              {deadlineCount === 1 ? "assessment" : "assessments"}
            </span>
          </span>
          {byCourse ? (
            <span>
              <strong className="font-semibold">
                {averageCourseWeight(deadlines) === null
                  ? "—"
                  : `${averageCourseWeight(deadlines)}%`}
              </strong>{" "}
              <span className="text-muted-foreground">avg per course</span>
            </span>
          ) : (
            <span>
              <strong className="font-semibold">{totalWeight}%</strong>{" "}
              <span className="text-muted-foreground">combined</span>
            </span>
          )}
        </div>
        {affected && (
          <p className="flex w-full items-center gap-1.5 text-sm">
            <Users className="size-4 text-muted-foreground" />
            Affects <strong className="font-semibold">{affected.students}</strong> of{" "}
            {affected.cohortSize} students
          </p>
        )}
        {byCourse && (
          <ul
            className="flex w-full flex-wrap gap-2 text-sm"
            aria-label="Share of each course's grade"
          >
            {weightByCourse(deadlines).map(({ courseId, weight }) => (
              <li key={courseId} className="rounded-full border bg-card px-3 py-1">
                <span className="text-muted-foreground">
                  {courses.get(courseId)?.code ?? "Course"}
                </span>{" "}
                <strong className="font-semibold">{weight === null ? "—" : `${weight}%`}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="px-5 py-2">
        <ul className="divide-y">
          {deadlines.map((d) => (
            <DeadlineRow
              key={d.id}
              deadline={d}
              course={courses.get(d.course_id)}
              own={ownCourseId !== undefined && d.course_id === ownCourseId}
            />
          ))}
        </ul>
      </div>
      {peak && (
        <div className="flex items-center gap-2 border-t px-5 py-3 text-sm">
          <Activity className="size-4 text-muted-foreground" />
          {peak.value !== null && peak.date ? (
            <span>
              Nearby stress peak: <StressDot value={peak.value} className="mx-1 align-middle" />
              <strong className="font-semibold">{peak.value.toFixed(1)}</strong> on{" "}
              {shortDate(peak.date)}
            </span>
          ) : start >= today ? (
            <span className="text-muted-foreground">
              Still ahead — no check-ins for these days yet.
            </span>
          ) : (
            <span className="text-muted-foreground">Nearby stress peak: Not enough responses</span>
          )}
        </div>
      )}
      {footer && <div className="border-t px-5 py-4">{footer}</div>}
    </Card>
  );
}
