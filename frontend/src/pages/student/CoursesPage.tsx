import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api, qk } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState, LoadingBlock } from "@/components/StateViews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useMe } from "./useMe";

export function CoursesPage() {
  const me = useMe();
  const all = useQuery({ queryKey: qk.courses(), queryFn: api.getCourses });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [filter, setFilter] = useState("");

  const isOnboarding = me.data?.courses.length === 0;

  useEffect(() => {
    if (me.data && selected === null) setSelected(new Set(me.data.courses.map((c) => c.id)));
  }, [me.data, selected]);

  const save = useMutation({
    mutationFn: () => api.updateMyCourses([...(selected ?? [])]),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Courses saved");
      if (isOnboarding) navigate({ to: "/student" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (all.data?.courses ?? []).filter(
      (c) => !f || c.code.toLowerCase().includes(f) || c.name.toLowerCase().includes(f),
    );
  }, [all.data, filter]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const dirty =
    !!me.data &&
    !!selected &&
    (selected.size !== me.data.courses.length || me.data.courses.some((c) => !selected.has(c.id)));

  return (
    <div className="pb-20">
      <PageHeader
        eyebrow={isOnboarding ? "Welcome" : "Your courses"}
        title={isOnboarding ? "Which courses are you taking?" : "Enrolled courses"}
        description="We use these to line your check-ins up with your deadlines. Only you see your own data."
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by code or name"
          className="h-12 rounded-full bg-card pl-11"
          aria-label="Search courses"
        />
      </div>

      {all.isPending || me.isPending ? (
        <LoadingBlock rows={4} />
      ) : all.isError ? (
        <ErrorState error={all.error} onRetry={() => all.refetch()} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((c) => {
            const on = selected?.has(c.id) ?? false;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border bg-card px-4 py-4 text-left shadow-soft transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on && "border-primary/50 bg-primary-soft",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold">{c.code}</p>
                    <p className="truncate text-sm text-muted-foreground">{c.name}</p>
                  </div>
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground",
                    )}
                  >
                    {on ? <Check className="size-4" /> : <Plus className="size-4" />}
                  </span>
                  <span className="sr-only">{on ? "Remove" : "Add"}</span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No courses match "{filter}".
            </li>
          )}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 px-4 md:static md:mt-6 md:px-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full border bg-card/95 py-2 pl-5 pr-2 shadow-lift backdrop-blur md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <span className="text-sm text-muted-foreground">
            {selected?.size ?? 0} selected
          </span>
          <Button
            onClick={() => save.mutate()}
            disabled={!selected || selected.size === 0 || save.isPending || (!dirty && !isOnboarding)}
          >
            {save.isPending ? "Saving…" : isOnboarding ? "Continue" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
