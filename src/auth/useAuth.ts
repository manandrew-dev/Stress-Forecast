import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import type { Role } from "@/api/types";
import { getSessionUser, setSessionRole, subscribeSession, type AuthUser } from "./session";

const noopSubscribe = () => () => {};

/**
 * Stub auth hook. `ready` is false during server render / before hydration,
 * so guards don't redirect before the stored role has been read.
 */
export function useAuth(): {
  user: AuthUser | null;
  ready: boolean;
  login: (role: Role) => void;
  logout: () => void;
  switchRole: (role: Role) => void;
} {
  const queryClient = useQueryClient();
  const user = useSyncExternalStore(subscribeSession, getSessionUser, () => null);
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const login = useCallback(
    (role: Role) => {
      queryClient.clear();
      setSessionRole(role);
    },
    [queryClient],
  );
  const logout = useCallback(() => {
    queryClient.clear();
    setSessionRole(null);
  }, [queryClient]);

  return { user, ready, login, logout, switchRole: login };
}
