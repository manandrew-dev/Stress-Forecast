import {
  BookOpen,
  ClipboardList,
  FileQuestion,
  FlaskConical,
  GraduationCap,
  PenLine,
} from "lucide-react";

import type { Course, Deadline, DeadlineType } from "@/api/types";
import { longDate } from "@/lib/dates";

export const TYPE_ICON: Record<DeadlineType, typeof BookOpen> = {
  exam: GraduationCap,
  midterm: ClipboardList,
  quiz: FileQuestion,
  assignment: PenLine,
  project: FlaskConical,
  other: BookOpen,
};

export const TYPE_LABEL: Record<DeadlineType, string> = {
  exam: "Exam",
  midterm: "Midterm",
  quiz: "Quiz",
  assignment: "Assignment",
  project: "Project",
  other: "Other",
};

export function DeadlineRow({
  deadline,
  course,
  own = false,
}: {
  deadline: Deadline;
  course?: Course | undefined;
  /** Highlight as the viewer's own course (rep pile-ups). */
  own?: boolean;
}) {
  const Icon = TYPE_ICON[deadline.type];
  return (
    <li
      className={`flex items-center gap-3 py-2.5 ${own ? "-mx-2 rounded-lg bg-primary-soft/60 px-2" : ""}`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-deadline-soft text-deadline-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {course && <span className="text-muted-foreground">{course.code} · </span>}
          {deadline.title}
          {own && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              This course
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {longDate(deadline.due_date)} · {TYPE_LABEL[deadline.type]}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {deadline.weight_pct === null ? "—" : `${deadline.weight_pct}%`}
      </span>
    </li>
  );
}
