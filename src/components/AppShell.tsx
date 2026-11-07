import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, LogOut, Repeat2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { Role } from "@/api/types";
import { useAuth } from "@/auth/useAuth";
import { Logo } from "@/components/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type AppPath =
  | "/student"
  | "/student/check-in"
  | "/student/trend"
  | "/student/syllabus"
  | "/student/courses"
  | "/rep"
  | "/rep/collisions"
  | "/rep/report"
  | "/rep/insights";

export interface NavItem {
  to: AppPath;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

function RoleMenu() {
  const { user, switchRole, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const other: Role = user.role === "student" ? "rep" : "student";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-sm font-medium shadow-soft transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {user.name[0]}
        </span>
        <span className="hidden sm:inline">{user.name}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          {user.role === "rep" ? "Rep" : "Student"}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Demo account — no real login yet
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            switchRole(other);
            navigate({ to: other === "rep" ? "/rep" : "/student" });
          }}
        >
          <Repeat2 className="size-4" /> Switch to {other === "rep" ? "class rep" : "student"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            logout();
            navigate({ to: "/" });
          }}
        >
          <LogOut className="size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  home,
  nav,
  toolbar,
  children,
}: {
  home: "/student" | "/rep";
  nav: NavItem[];
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-paper min-h-screen pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Logo to={home} />
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-primary-soft text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <RoleMenu />
          </div>
        </div>
        {toolbar && (
          <div className="mx-auto max-w-5xl px-4 pb-3">{toolbar}</div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 sm:pt-8">{children}</main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto flex max-w-md justify-around">
          {nav.map((item) => (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground"
                activeProps={{ className: "text-primary" }}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
