import { useQuery } from "@tanstack/react-query";

import { api, qk } from "@/api/client";
import { useAuth } from "@/auth/useAuth";

export function useMe() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.me(user?.id ?? "anon"),
    queryFn: api.getMe,
    enabled: !!user,
  });
}
