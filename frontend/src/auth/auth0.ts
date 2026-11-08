// Real login with Auth0 (docs/architecture.md §5). Browser only: the SDK touches `window`
// as soon as it's imported, so it's loaded with a dynamic import after the page hydrates.
// (The architecture doc names @auth0/auth0-react; that wrapper crashes during TanStack
// Start's server render, so we use the @auth0/auth0-spa-js client it's built on.)
import type { Auth0Client } from "@auth0/auth0-spa-js";

import { setAccessTokenProvider } from "@/api/client";
import type { Role } from "@/api/types";
import { setAuth0State } from "./session";

/** Custom claim the Auth0 Post-Login Action adds to the access token. */
export const ROLES_CLAIM = "https://stressforecast.app/roles";

const env = (k: string) => import.meta.env[k] as string | undefined;

let clientPromise: Promise<Auth0Client> | null = null;

function getClient(): Promise<Auth0Client> {
  clientPromise ??= import("@auth0/auth0-spa-js").then(({ createAuth0Client }) =>
    createAuth0Client({
      domain: env("VITE_AUTH0_DOMAIN")!,
      clientId: env("VITE_AUTH0_CLIENT_ID")!,
      authorizationParams: {
        audience: env("VITE_AUTH0_AUDIENCE"),
        redirect_uri: window.location.origin,
      },
      // Keeps people logged in across reloads without third-party cookies.
      // Needs "Refresh Token Rotation" enabled on the Auth0 application.
      cacheLocation: "localstorage",
      useRefreshTokens: true,
    }),
  );
  return clientPromise;
}

/**
 * Reads the role from an access token's roles claim. Routing only; the API enforces roles.
 * Same rule as backend/app/auth.py: exactly ["student"] or ["rep"], anything else is no role
 * (the API answers 403), so we never route someone to a view the API would refuse.
 */
export function roleFromAccessToken(token: string): Role | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(
      atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")),
    );
    const roles: unknown = claims[ROLES_CLAIM];
    if (!Array.isArray(roles) || roles.length !== 1) return null;
    return roles[0] === "student" || roles[0] === "rep" ? roles[0] : null;
  } catch {
    return null;
  }
}

let started = false;

/** Restores the session (or finishes a login redirect). Safe to call many times. */
export function startAuth0(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    try {
      const client = await getClient();

      const params = new URLSearchParams(window.location.search);
      let justLoggedIn = false;
      if (params.has("state") && (params.has("code") || params.has("error"))) {
        await client.handleRedirectCallback();
        window.history.replaceState(null, "", window.location.pathname);
        justLoggedIn = true;
      }

      if (!(await client.isAuthenticated())) {
        setAuth0State({ user: null, ready: true, error: null });
        return;
      }

      const token = await client.getTokenSilently();
      const role = token ? roleFromAccessToken(token) : null;
      if (!role) {
        setAuth0State({
          user: null,
          ready: true,
          error:
            "Your account doesn't have a student or rep role yet. Ask the team to add one, then log in again.",
        });
        return;
      }

      const profile = await client.getUser();
      setAccessTokenProvider(() => client.getTokenSilently());
      setAuth0State({
        user: {
          id: profile?.sub ?? "",
          // First name or nickname only; never shown to anyone else.
          name: profile?.given_name ?? profile?.nickname ?? profile?.name ?? "there",
          role,
        },
        ready: true,
        error: null,
        justLoggedIn,
      });
    } catch (e) {
      setAuth0State({
        user: null,
        ready: true,
        error:
          e instanceof Error ? `Login failed: ${e.message}` : "Login failed. Please try again.",
      });
    }
  })();
}

export async function auth0Login(): Promise<void> {
  const client = await getClient();
  await client.loginWithRedirect();
}

export async function auth0Logout(): Promise<void> {
  const client = await getClient();
  setAccessTokenProvider(null);
  setAuth0State({ user: null });
  await client.logout({ logoutParams: { returnTo: window.location.origin } });
}
