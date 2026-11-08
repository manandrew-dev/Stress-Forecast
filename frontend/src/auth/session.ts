import type { Role } from "@/api/types";

// Stub session. There is no real login yet: "logging in" just picks a fake user.
// When real auth arrives, replace this module and keep the useAuth() shape.

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

export const FAKE_USERS: Record<Role, AuthUser> = {
  student: { id: "stu_8f2a", name: "Maya", role: "student" },
  rep: { id: "rep_31c9", name: "Jordan", role: "rep" },
};

const KEY = "stress-forecast:stub-role";
const listeners = new Set<() => void>();
let cachedRole: Role | null | undefined;

function readRole(): Role | null {
  if (typeof window === "undefined") return null;
  if (cachedRole !== undefined) return cachedRole;
  const v = window.localStorage.getItem(KEY);
  cachedRole = v === "student" || v === "rep" ? v : null;
  return cachedRole;
}

export function getSessionUser(): AuthUser | null {
  const role = readRole();
  return role ? FAKE_USERS[role] : null;
}

export function setSessionRole(role: Role | null): void {
  cachedRole = role;
  if (role) window.localStorage.setItem(KEY, role);
  else window.localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
