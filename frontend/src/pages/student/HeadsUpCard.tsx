import { useQuery } from "@tanstack/react-query";
import { Sun, Umbrella } from "lucide-react";

import { api, qk } from "@/api/client";
import { useAuth } from "@/auth/useAuth";
import { CollisionCard } from "@/components/CollisionCard";
import { ErrorState, LoadingBlock } from "@/components/StateViews";
import { useCourseMap } from "@/components/useCourseMap";

export function HeadsUpCard() {
  const { user } = useAuth();
  const courses = useCourseMap();
  const q = useQuery({ queryKey: qk.headsUp(user?.id ?? "anon"), queryFn: api.getHeadsUp });

  return (
    <section aria-labelledby="heads-up-title" className="space-y-4">
      <div className="flex items-center gap-2">
        <Umbrella className="size-5 text-deadline-foreground" />
        <h2 id="heads-up-title" className="text-xl font-semibold">
          Heads-up for the next two weeks
        </h2>
      </div>
      {q.isPending ? (
        <LoadingBlock rows={1} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.collisions.length === 0 ? (
        <div className="flex items-center gap-4 rounded-2xl border bg-card px-5 py-5 shadow-soft">
          <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft">
            <Sun className="size-5 text-primary" />
          </span>
          <p className="text-sm text-muted-foreground">
            Clear skies — no deadline pile-ups in the next two weeks.
          </p>
        </div>
      ) : (
        q.data.collisions.map((c) => (
          <CollisionCard
            key={c.start}
            start={c.start}
            end={c.end}
            deadlineCount={c.deadline_count}
            totalWeight={c.total_weight_pct}
            deadlines={c.deadlines}
            courses={courses}
            footer={<p className="text-sm leading-relaxed">{c.message}</p>}
          />
        ))
      )}
    </section>
  );
}
