import { Link } from "@tanstack/react-router";
import { ArrowRight, HeartPulse, LineChart } from "lucide-react";

import { useAuth } from "@/auth/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { HeadsUpCard } from "./HeadsUpCard";
import { useMe } from "./useMe";

export function StudentHomePage() {
  const { user } = useAuth();
  const me = useMe();
  const codes = me.data?.courses.map((c) => c.code).join(", ");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Today"
        title={`Hi ${user?.name ?? "there"}, how's the weather in your head?`}
        description={codes ? `Tracking ${codes}.` : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/student/check-in"
          className="group animate-rise flex items-center gap-4 rounded-2xl bg-primary px-5 py-5 text-primary-foreground shadow-lift transition-transform hover:-translate-y-0.5"
        >
          <span className="animate-breathe flex size-12 items-center justify-center rounded-full bg-primary-foreground/15">
            <HeartPulse className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-semibold">Daily check-in</span>
            <span className="text-sm opacity-85">Takes about 30 seconds</span>
          </span>
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          to="/student/trend"
          className="group animate-rise flex items-center gap-4 rounded-2xl border bg-card px-5 py-5 shadow-soft transition-transform hover:-translate-y-0.5"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft">
            <LineChart className="size-6 text-primary" />
          </span>
          <span className="flex-1">
            <span className="block font-display text-lg font-semibold">My trend</span>
            <span className="text-sm text-muted-foreground">Stress vs. your deadlines</span>
          </span>
          <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <HeadsUpCard />

      <p className="text-center text-sm text-muted-foreground">
        Missing a course's deadlines?{" "}
        <Button asChild variant="link" className="h-auto p-0">
          <Link to="/student/syllabus">Upload its syllabus</Link>
        </Button>
      </p>
    </div>
  );
}
