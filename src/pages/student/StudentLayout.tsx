import { Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { BookOpenCheck, FileUp, HeartPulse, Home, LineChart } from "lucide-react";

import { AppShell, type NavItem } from "@/components/AppShell";
import { RequireRole } from "@/components/RequireRole";
import { ErrorState, Spinner } from "@/components/StateViews";
import { useMe } from "./useMe";

const NAV: NavItem[] = [
  { to: "/student", label: "Today", icon: Home, exact: true },
  { to: "/student/check-in", label: "Check-in", icon: HeartPulse },
  { to: "/student/trend", label: "Trend", icon: LineChart },
  { to: "/student/syllabus", label: "Syllabus", icon: FileUp },
  { to: "/student/courses", label: "Courses", icon: BookOpenCheck },
];

function OnboardingGate() {
  const me = useMe();
  const { pathname } = useLocation();
  if (me.isPending) return <Spinner />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  // First visit: nothing enrolled yet → onboarding.
  if (me.data.courses.length === 0 && pathname !== "/student/courses") {
    return <Navigate to="/student/courses" replace />;
  }
  return <Outlet />;
}

export function StudentLayout() {
  return (
    <RequireRole role="student">
      <AppShell home="/student" nav={NAV}>
        <OnboardingGate />
      </AppShell>
    </RequireRole>
  );
}
