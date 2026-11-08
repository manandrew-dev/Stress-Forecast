import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api, qk } from "@/api/client";
import type { Course } from "@/api/types";

/** All courses keyed by id, for labelling deadlines. */
export function useCourseMap(): Map<number, Course> {
  const { data } = useQuery({ queryKey: qk.courses(), queryFn: api.getCourses, staleTime: 5 * 60_000 });
  return useMemo(() => new Map((data?.courses ?? []).map((c) => [c.id, c])), [data]);
}
