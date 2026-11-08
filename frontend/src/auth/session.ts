import type { Role } from "@/api/types";

// The current user, from one of two sources:
// - "auth0": real login (docs/architecture.md §5), used when VITE_AUTH0_DOMAIN and
//   VITE_AUTH0_CLIENT_ID are set. See ./auth0.ts.
// - "demo": no real login; "logging in" just picks a fake student or rep.
// The mocks switch (VITE_USE_MOCKS) is separate, so real login works against mock data too.

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

export type AuthMode = "demo" | "auth0";

export const AUTH_MODE: AuthMode =
  import.meta.env["VITE_AUTH0_DOMAIN"] && import.meta.env["VITE_AUTH0_CLIENT_ID"]
    ? "auth0"
    : "demo";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------- demo mode ----------

export const FAKE_USERS: Record<Role, AuthUser> = {
  student: { id: "stu_8f2a", name: "Maya", role: "student" },
  rep: { id: "rep_31c9", name: "Jordan", role: "rep" },
};

const KEY = "stress-forecast:stub-role";
let cachedRole: Role | null | undefined;

function readDemoRole(): Role | null {
  if (typeof window === "undefined") return null;
  if (cachedRole !== undefined) return cachedRole;
  let v: string | null = null;
  try {
    v = window.localStorage.getItem(KEY);
  } catch {
    // storage blocked: behave as logged out
  }
  cachedRole = v === "student" || v === "rep" ? v : null;
  return cachedRole;
}

/** Demo mode only: pick a fake user (or null to log out). */
export function setSessionRole(role: Role | null): void {
  cachedRole = role;
  try {
    if (role) window.localStorage.setItem(KEY, role);
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: keep the in-memory role
  }
  notify();
}

// ---------- auth0 mode ----------

export interface Auth0State {
  user: AuthUser | null;
  /** False until we know whether the user is logged in. */
  ready: boolean;
  /** Shown on the landing page, e.g. a login that worked but carried no role. */
  error: string | null;
  /** True right after returning from the Auth0 login page. */
  justLoggedIn: boolean;
}

const SERVER_AUTH0_STATE: Auth0State = {
  user: null,
  ready: false,
  error: null,
  justLoggedIn: false,
};
let auth0State: Auth0State = SERVER_AUTH0_STATE;

export function getAuth0State(): Auth0State {
  return auth0State;
}

export function getServerAuth0State(): Auth0State {
  return SERVER_AUTH0_STATE;
}

export function setAuth0State(patch: Partial<Auth0State>): void {
  auth0State = { ...auth0State, ...patch };
  notify();
}

// ---------- either mode ----------

/** The logged-in user, or null. Used by the mocks to answer as that user. */
export function getSessionUser(): AuthUser | null {
  if (AUTH_MODE === "auth0") return auth0State.user;
  const role = readDemoRole();
  return role ? FAKE_USERS[role] : null;
}
