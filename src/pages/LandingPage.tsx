import { useNavigate } from "@tanstack/react-router";
import { CalendarRange, HeartPulse, LineChart } from "lucide-react";

import type { Role } from "@/api/types";
import { useAuth } from "@/auth/useAuth";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import heroImg from "@/assets/landing-forecast.jpg";

const POINTS = [
  {
    icon: HeartPulse,
    title: "A 30-second check-in",
    body: "Type or say how you're doing. We pick out stress, sleep and what's behind it.",
  },
  {
    icon: LineChart,
    title: "See the forecast",
    body: "Your stress lined up with your deadlines, plus a heads-up before a rough stretch.",
  },
  {
    icon: CalendarRange,
    title: "Fix the schedule",
    body: "Class reps see anonymous class averages and where deadlines pile up — with a fix to suggest.",
  },
];

export function LandingPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();

  const enter = (role: Role) => {
    login(role);
    navigate({ to: role === "rep" ? "/rep" : "/student" });
  };

  return (
    <div className="bg-paper min-h-screen">
      <header className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4">
        <LogoMark />
        <span className="font-display text-lg font-semibold">Stress Forecast</span>
        <div className="ml-auto">
          {ready && user ? (
            <Button variant="outline" size="sm" onClick={() => enter(user.role)}>
              Open my dashboard
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => enter("student")}>
              Log in
            </Button>
          )}
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-5xl px-4 pb-6 pt-10 sm:pt-16">
            <div className="animate-rise max-w-2xl space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                For students and class reps
              </p>
              <h1 className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
                When the whole class is stressed at once, it's usually the calendar.
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                Stress Forecast connects how students feel with when their deadlines land — so you can see the
                storm coming, and help move it.
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Button variant="hero" size="lg" onClick={() => enter(user?.role ?? "student")}>
                  {ready && user ? "Continue" : "Log in"}
                </Button>
                {!(ready && user) && (
                  <Button variant="ghost" size="lg" onClick={() => enter("rep")}>
                    Try it as a class rep
                  </Button>
                )}
              </div>
            </div>
          </div>
          <img
            src={heroImg}
            alt="Calm hills around a university campus, with one small rain cloud and sun breaking through"
            width={1600}
            height={1008}
            className="mx-auto -mt-16 w-full max-w-6xl object-cover sm:-mt-28 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]"
          />
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-16 sm:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="rounded-2xl border bg-card p-5 shadow-soft">
              <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary-soft">
                <p.icon className="size-5 text-primary" />
              </span>
              <h2 className="mb-1 text-lg font-semibold">{p.title}</h2>
              <p className="text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </section>
        <footer className="pb-10 text-center text-xs text-muted-foreground">
          Demo build — sample data, no real accounts.
        </footer>
      </main>
    </div>
  );
}
