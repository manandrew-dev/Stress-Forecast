// Auth0 mode (src/auth/auth0.ts) with the Auth0 SDK faked: no network, no real tenant.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROLES_CLAIM = "https://stressforecast.app/roles";

/** An unsigned JWT-shaped token; only the payload matters for routing. */
function fakeToken(claims: Record<string, unknown>): string {
  const b64url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "RS256" })}.${b64url(claims)}.sig`;
}

const client = {
  handleRedirectCallback: vi.fn(),
  isAuthenticated: vi.fn(),
  getTokenSilently: vi.fn(),
  getUser: vi.fn(),
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
};
const createAuth0Client = vi.fn(async (_opts: unknown) => client);
vi.mock("@auth0/auth0-spa-js", () => ({ createAuth0Client }));

async function load() {
  vi.resetModules();
  vi.stubEnv("VITE_AUTH0_DOMAIN", "tenant.us.auth0.com");
  vi.stubEnv("VITE_AUTH0_CLIENT_ID", "client123");
  vi.stubEnv("VITE_AUTH0_AUDIENCE", "https://api.stressforecast.app");
  vi.stubEnv("VITE_USE_MOCKS", "false");
  const auth0 = await import("@/auth/auth0");
  const session = await import("@/auth/session");
  const api = await import("@/api/client");
  return { auth0, session, api };
}

/** Wait until startAuth0() has finished restoring the session. */
async function settled(session: typeof import("@/auth/session")) {
  await vi.waitFor(() => expect(session.getAuth0State().ready).toBe(true));
}

beforeEach(() => {
  Object.values(client).forEach((f) => f.mockReset());
  createAuth0Client.mockClear();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("roleFromAccessToken", () => {
  it("reads the roles claim", async () => {
    const { auth0 } = await load();
    expect(auth0.roleFromAccessToken(fakeToken({ [ROLES_CLAIM]: ["student"] }))).toBe("student");
    expect(auth0.roleFromAccessToken(fakeToken({ [ROLES_CLAIM]: ["rep"] }))).toBe("rep");
  });

  it("returns null without a usable role", async () => {
    const { auth0 } = await load();
    expect(auth0.roleFromAccessToken(fakeToken({}))).toBeNull();
    expect(auth0.roleFromAccessToken(fakeToken({ [ROLES_CLAIM]: ["admin"] }))).toBeNull();
    expect(auth0.roleFromAccessToken("not-a-jwt")).toBeNull();
  });

  it("treats two roles as no role, like the API (which answers 403)", async () => {
    const { auth0 } = await load();
    expect(auth0.roleFromAccessToken(fakeToken({ [ROLES_CLAIM]: ["student", "rep"] }))).toBeNull();
    expect(auth0.roleFromAccessToken(fakeToken({ [ROLES_CLAIM]: [] }))).toBeNull();
  });
});

describe("startAuth0", () => {
  it("switches to auth0 mode when domain and client id are set", async () => {
    const { session } = await load();
    expect(session.AUTH_MODE).toBe("auth0");
  });

  it("configures the client for our API audience with refresh tokens", async () => {
    const { auth0, session } = await load();
    client.isAuthenticated.mockResolvedValue(false);
    auth0.startAuth0();
    await settled(session);
    expect(createAuth0Client).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "tenant.us.auth0.com",
        clientId: "client123",
        authorizationParams: expect.objectContaining({
          audience: "https://api.stressforecast.app",
        }),
        useRefreshTokens: true,
      }),
    );
  });

  it("is logged out when Auth0 has no session", async () => {
    const { auth0, session } = await load();
    client.isAuthenticated.mockResolvedValue(false);
    auth0.startAuth0();
    await settled(session);
    expect(session.getSessionUser()).toBeNull();
    expect(session.getAuth0State().error).toBeNull();
  });

  it("restores a rep and sends their token on API calls", async () => {
    const { auth0, session, api } = await load();
    const token = fakeToken({ [ROLES_CLAIM]: ["rep"] });
    client.isAuthenticated.mockResolvedValue(true);
    client.getTokenSilently.mockResolvedValue(token);
    client.getUser.mockResolvedValue({ sub: "auth0|abc", given_name: "Lawrence", email: "x@y.z" });
    auth0.startAuth0();
    await settled(session);

    expect(session.getSessionUser()).toEqual({ id: "auth0|abc", name: "Lawrence", role: "rep" });

    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ courses: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await api.api.getCourses();
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("shows an error when the token has no role", async () => {
    const { auth0, session } = await load();
    client.isAuthenticated.mockResolvedValue(true);
    client.getTokenSilently.mockResolvedValue(fakeToken({}));
    auth0.startAuth0();
    await settled(session);
    expect(session.getSessionUser()).toBeNull();
    expect(session.getAuth0State().error).toMatch(/role/);
  });

  it("finishes a login redirect and cleans the URL", async () => {
    const { auth0, session } = await load();
    window.history.replaceState(null, "", "/?code=abc&state=xyz");
    client.isAuthenticated.mockResolvedValue(true);
    client.getTokenSilently.mockResolvedValue(fakeToken({ [ROLES_CLAIM]: ["student"] }));
    client.getUser.mockResolvedValue({ sub: "auth0|s1", nickname: "andrew" });
    auth0.startAuth0();
    await settled(session);

    expect(client.handleRedirectCallback).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("");
    expect(session.getAuth0State()).toMatchObject({
      justLoggedIn: true,
      user: { role: "student" },
    });
  });

  it("reports a failed login instead of hanging", async () => {
    const { auth0, session } = await load();
    window.history.replaceState(null, "", "/?error=access_denied&state=xyz");
    client.handleRedirectCallback.mockRejectedValue(new Error("access_denied"));
    auth0.startAuth0();
    await settled(session);
    expect(session.getAuth0State().error).toMatch(/access_denied/);
  });
});
