import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { Role } from "@/api/types";
import { useAuth } from "@/auth/useAuth";
import { Spinner } from "@/components/StateViews";

/**
 * Students only see /student, reps only see /rep, logged-out users only see the landing page.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== role) return <Navigate to={user.role === "rep" ? "/rep" : "/student"} replace />;
  return <>{children}</>;
}
