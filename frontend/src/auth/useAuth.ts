import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { Role } from "@/api/types";
import { auth0Login, auth0Logout, startAuth0 } from "./auth0";
import {
  AUTH_MODE,
  getAuth0State,
  getServerAuth0State,
  getSessionUser,
  setAuth0State,
  setSessionRole,
  subscribeSession,
  type AuthMode,
  type AuthUser,
} from "./session";

const noopSubscribe = () => () => {};

export interface UseAuth {
  mode: AuthMode;
  user: AuthUser | null;
  /** False during server render and until the session is known, so guards don't redirect early. */
  ready: boolean;
  /** Auth0 mode: a login problem to show the user. */
  error: string | null;
  /** Demo mode: log in as `role`. Auth0 mode: go to the Auth0 login page (role comes from Auth0). */
  login: (role?: Role) => void;
  logout: () => void;
  /** Demo mode only. */
  switchRole: ((role: Role) => void) | null;
  /** True once, right after returning from Auth0, so the landing page can forward the user. */
  consumeJustLoggedIn: () => boolean;
}

export function useAuth(): UseAuth {
  const queryClient = useQueryClient();
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const demoUser = useSyncExternalStore(subscribeSession, getSessionUser, () => null);
  const auth0 = useSyncExternalStore(subscribeSession, getAuth0State, getServerAuth0State);

  useEffect(() => {
    if (AUTH_MODE === "auth0") startAuth0();
  }, []);

  const demoLogin = useCallback(
    (role: Role = "student") => {
      queryClient.clear();
      setSessionRole(role);
    },
    [queryClient],
  );
  const demoLogout = useCallback(() => {
    queryClient.clear();
    setSessionRole(null);
  }, [queryClient]);

  const auth0LoginCb = useCallback(() => void auth0Login(), []);
  const auth0LogoutCb = useCallback(() => {
    queryClient.clear();
    void auth0Logout();
  }, [queryClient]);

  const consumeJustLoggedIn = useCallback(() => {
    if (!getAuth0State().justLoggedIn) return false;
    setAuth0State({ justLoggedIn: false });
    return true;
  }, []);

  if (AUTH_MODE === "auth0") {
    return {
      mode: "auth0",
      user: auth0.user,
      ready: hydrated && auth0.ready,
      error: auth0.error,
      login: auth0LoginCb,
      logout: auth0LogoutCb,
      switchRole: null,
      consumeJustLoggedIn,
    };
  }
  return {
    mode: "demo",
    user: demoUser,
    ready: hydrated,
    error: null,
    login: demoLogin,
    logout: demoLogout,
    switchRole: demoLogin,
    consumeJustLoggedIn: () => false,
  };
}
