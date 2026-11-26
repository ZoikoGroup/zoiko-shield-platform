import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rewriteRefreshCookiePath } from "@/lib/refresh-cookie";

const STATE_KEY = "zoikoshield_demo_state";

function jwt(expSecondsFromNow: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "none" })}.${b64({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow })}.sig`;
}

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("rewriteRefreshCookiePath", () => {
  it("re-scopes only the refresh cookie to the path the browser calls", () => {
    expect(rewriteRefreshCookiePath("refresh_token=abc; Max-Age=2592000; Path=/auth; HttpOnly; SameSite=Lax"))
      .toBe("refresh_token=abc; Max-Age=2592000; Path=/api/v1/auth; HttpOnly; SameSite=Lax");
    expect(rewriteRefreshCookiePath("refresh_token=; Path=/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT"))
      .toContain("Path=/api/v1/auth");
  });

  it("leaves every other cookie alone", () => {
    const access = "access_token=abc; Path=/; HttpOnly";
    const recovery = "recovery_grant=abc; Path=/auth/password-recovery; HttpOnly";
    expect(rewriteRefreshCookiePath(access)).toBe(access);
    expect(rewriteRefreshCookiePath(recovery)).toBe(recovery);
  });
});

describe("session refresh", () => {
  let backend: ReturnType<typeof vi.fn>;
  const originalFetch = window.fetch;
  const originalLocation = window.location;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ session: { token: "expired-token", isAuthenticated: true, role: "SUPER_ADMIN" } })
    );
    delete (window as any).__zoikoSessionRefresh;
    backend = vi.fn();
    window.fetch = backend as unknown as typeof fetch;
    assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "http://localhost", pathname: "/connectors", search: "", assign },
    });
    const { installSessionRefresh } = await import("@/lib/session-refresh");
    installSessionRefresh();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("renews the token on 401 and replays the request with it", async () => {
    const fresh = jwt(900);
    backend.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/v1/auth/refresh") return json(200, { success: true, accessToken: fresh });
      const auth = new Headers(init?.headers).get("Authorization");
      return auth === `Bearer ${fresh}` ? json(200, { data: [] }) : json(401, { message: "Unauthorized" });
    });

    const res = await window.fetch("/api/v1/connectors", {
      headers: { Authorization: "Bearer expired-token" },
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(localStorage.getItem(STATE_KEY)!).session.token).toBe(fresh);
    expect(assign).not.toHaveBeenCalled();
  });

  it("renews the session for callers that rely on cookies only", async () => {
    let calls = 0;
    backend.mockImplementation(async (url: string) => {
      if (url === "/api/v1/auth/refresh") return json(200, { accessToken: jwt(900) });
      return ++calls === 1 ? json(401) : json(200, { data: [] });
    });
    const res = await window.fetch("/api/v1/cases", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
  });

  it("makes one refresh call when several requests expire together", async () => {
    const fresh = jwt(900);
    let refreshes = 0;
    backend.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/v1/auth/refresh") {
        refreshes++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { accessToken: fresh });
      }
      return new Headers(init?.headers).get("Authorization") === `Bearer ${fresh}` ? json(200) : json(401);
    });
    const call = (p: string) => window.fetch(p, { headers: { Authorization: "Bearer expired-token" } });

    const results = await Promise.all([call("/api/v1/alerts"), call("/api/v1/cases"), call("/api/v1/connectors")]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshes).toBe(1);
  });

  it("signs the user out when the refresh token is rejected", async () => {
    backend.mockImplementation(async (url: string) =>
      url === "/api/v1/auth/refresh" ? json(401) : json(401, { message: "Unauthorized" })
    );
    const res = await window.fetch("/api/v1/connectors", { headers: { Authorization: "Bearer expired-token" } });
    expect(res.status).toBe(401);
    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign.mock.calls[0][0]).toContain("/login?logout=true&redirect=%2Fconnectors");
  });

  it("does not sign the user out when the refresh endpoint is merely unavailable", async () => {
    backend.mockImplementation(async (url: string) =>
      url === "/api/v1/auth/refresh" ? json(503) : json(401)
    );
    const res = await window.fetch("/api/v1/connectors", { headers: { Authorization: "Bearer expired-token" } });
    expect(res.status).toBe(401);
    await new Promise((r) => setTimeout(r, 20));
    expect(assign).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STATE_KEY)!).session.token).toBe("expired-token");
  });

  it("never retries auth endpoints (a 401 there is a wrong password)", async () => {
    backend.mockResolvedValue(json(401, { message: "Invalid credentials" }));
    const res = await window.fetch("/api/v1/auth/login", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(backend).toHaveBeenCalledTimes(1);
  });

  it("leaves non-API requests untouched", async () => {
    backend.mockResolvedValue(json(401));
    const res = await window.fetch("https://example.com/thing");
    expect(res.status).toBe(401);
    expect(backend).toHaveBeenCalledTimes(1);
  });
});
