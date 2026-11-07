import { Outlet } from "@tanstack/react-router";
import { CalendarClock, ClipboardList, Lightbulb, Users } from "lucide-react";

import { AppShell, type NavItem } from "@/components/AppShell";
import { RequireRole } from "@/components/RequireRole";
import { ErrorState, Spinner } from "@/components/StateViews";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMe } from "@/pages/student/useMe";
import { RepCourseProvider, useRepCourse } from "./RepCourseContext";

const NAV: NavItem[] = [
  { to: "/rep", label: "Cohort", icon: Users, exact: true },
  { to: "/rep/collisions", label: "Pile-ups", icon: CalendarClock },
  { to: "/rep/report", label: "Report", icon: ClipboardList },
  { to: "/rep/insights", label: "Insights", icon: Lightbulb },
];

function CoursePicker() {
  const { courses, courseId, setCourseId } = useRepCourse();
  if (courseId === null) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Course</span>
      <Select value={String(courseId)} onValueChange={(v) => setCourseId(Number(v))}>
        <SelectTrigger className="h-9 w-auto min-w-56 rounded-full bg-card" aria-label="Course">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {courses.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.code} — {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RepInner() {
  const me = useMe();
  if (me.isPending) return <Spinner />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  return (
    <RepCourseProvider courses={me.data.courses}>
      <AppShell home="/rep" nav={NAV} toolbar={<CoursePicker />}>
        <Outlet />
      </AppShell>
    </RepCourseProvider>
  );
}

export function RepLayout() {
  return (
    <RequireRole role="rep">
      <RepInner />
    </RequireRole>
  );
}
