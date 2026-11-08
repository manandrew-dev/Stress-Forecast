// The real-network path of src/api/client.ts (VITE_USE_MOCKS=false), checked against docs/api.md.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Client = typeof import("@/api/client");

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function loadClient(): Promise<Client> {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MOCKS", "false");
  vi.stubEnv("VITE_API_URL", "http://api.test/api/");
  return import("@/api/client");
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("api client (real network)", () => {
  it("sends the bearer token from the provider and no cookies", async () => {
    const { api, setAccessTokenProvider } = await loadClient();
    setAccessTokenProvider(async () => "tok_123");
    fetchMock.mockResolvedValue(
      jsonResponse(200, { id: "auth0|abc", role: "student", courses: [] }),
    );

    await expect(api.getMe()).resolves.toEqual({ id: "auth0|abc", role: "student", courses: [] });
    const { url, init, headers } = lastCall();
    expect(url).toBe("http://api.test/api/me");
    expect(headers.get("Authorization")).toBe("Bearer tok_123");
    expect(init.credentials).toBeUndefined();
  });

  it("sends no Authorization header without a token provider", async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { courses: [] }));
    await api.getCourses();
    expect(lastCall().headers.has("Authorization")).toBe(false);
  });

  it("maps a token failure to unauthorized without calling the API", async () => {
    const { api, setAccessTokenProvider } = await loadClient();
    setAccessTokenProvider(async () => {
      throw new Error("login_required");
    });
    await expect(api.getMe()).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps the API error shape to ApiError", async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValue(
      jsonResponse(403, { error: { code: "forbidden", message: "Rep role required" } }),
    );
    await expect(api.getCohort(1)).rejects.toMatchObject({
      name: "ApiError",
      code: "forbidden",
      message: "Rep role required",
      status: 403,
    });
  });

  it("falls back to a documented code when the error body isn't JSON", async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    await expect(api.getCourses()).rejects.toMatchObject({ code: "internal", status: 502 });
  });

  it("reports a network failure as network_error", async () => {
    const { api } = await loadClient();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api.getCourses()).rejects.toMatchObject({ code: "network_error", status: 0 });
  });

  it("resolves 204 responses to undefined", async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.updateMyCourses([1, 2])).resolves.toBeUndefined();
    const { url, init, headers } = lastCall();
    expect(url).toBe("http://api.test/api/me/courses");
    expect(init.method).toBe("PUT");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ course_ids: [1, 2] });
  });

  it("puts optional query params only when given", async () => {
    const { api } = await loadClient();
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));

    await api.getMyTrend();
    expect(lastCall().url).toBe("http://api.test/api/me/trend");
    await api.getMyTrend({ from: "2026-10-01", to: "2026-10-31" });
    expect(lastCall().url).toBe("http://api.test/api/me/trend?from=2026-10-01&to=2026-10-31");
    await api.getCohort(4, { from: "2026-11-01" });
    expect(lastCall().url).toBe("http://api.test/api/courses/4/cohort?from=2026-11-01");
    await api.getReport(4);
    expect(lastCall().url).toBe("http://api.test/api/courses/4/report");
    await api.getReport(4, "2026-11-02");
    expect(lastCall().url).toBe("http://api.test/api/courses/4/report?week_start=2026-11-02");
  });

  it("uploads a syllabus PDF as multipart without forcing a JSON content type", async () => {
    const { api } = await loadClient();
    fetchMock.mockResolvedValue(jsonResponse(200, { course_id: 1, deadlines: [] }));
    const file = new File(["%PDF-1.4"], "syllabus.pdf", { type: "application/pdf" });

    await api.uploadSyllabus({ course_id: 1, file });
    const { url, init, headers } = lastCall();
    expect(url).toBe("http://api.test/api/syllabus");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("course_id")).toBe("1");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("calls PUT and DELETE /deadlines/{id}", async () => {
    const { api } = await loadClient();
    const draft = {
      title: "Lab 3",
      due_date: "2026-11-20",
      weight_pct: 5,
      type: "assignment" as const,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 12, course_id: 1, ...draft }));
    await expect(api.updateDeadline(12, draft)).resolves.toEqual({
      id: 12,
      course_id: 1,
      ...draft,
    });
    expect(lastCall()).toMatchObject({
      url: "http://api.test/api/deadlines/12",
      init: { method: "PUT" },
    });
    expect(JSON.parse(lastCall().init.body as string)).toEqual(draft);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.deleteDeadline(12)).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({
      url: "http://api.test/api/deadlines/12",
      init: { method: "DELETE" },
    });
  });
});
