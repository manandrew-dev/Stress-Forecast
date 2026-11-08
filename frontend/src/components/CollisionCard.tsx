import { Activity, CalendarRange } from "lucide-react";
import type { ReactNode } from "react";

import type { Course, Deadline } from "@/api/types";
import { DeadlineRow } from "@/components/DeadlineRow";
import { StressDot } from "@/components/StressMeter";
import { Card } from "@/components/ui/card";
import { rangeLabel, shortDate } from "@/lib/dates";

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
}: {
  start: string;
  end: string;
  deadlineCount: number;
  totalWeight: number;
  deadlines: Deadline[];
  courses: Map<number, Course>;
  footer?: ReactNode;
  peak?: { value: number | null; date: string | null };
  /** Local "YYYY-MM-DD"; a pile-up starting after it has no check-ins yet. */
  today?: string;
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
            <span className="text-muted-foreground">assessments</span>
          </span>
          <span>
            <strong className="font-semibold">{totalWeight}%</strong>{" "}
            <span className="text-muted-foreground">combined</span>
          </span>
        </div>
      </div>
      <div className="px-5 py-2">
        <ul className="divide-y">
          {deadlines.map((d) => (
            <DeadlineRow key={d.id} deadline={d} course={courses.get(d.course_id)} />
          ))}
        </ul>
      </div>
      {peak && (
        <div className="flex items-center gap-2 border-t px-5 py-3 text-sm">
          <Activity className="size-4 text-muted-foreground" />
          {peak.value !== null && peak.date ? (
            <span>
              Nearby stress peak: <StressDot value={peak.value} className="mx-1 align-middle" />
              <strong className="font-semibold">{peak.value}</strong> on {shortDate(peak.date)}
            </span>
          ) : start > today ? (
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
