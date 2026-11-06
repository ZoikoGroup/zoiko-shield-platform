import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../app/api/v1/[...slug]/route";

function makeReq(path: string, body?: any, cookies: Record<string, string> = {}): NextRequest {
  const url = `http://localhost:3000/api/v1/${path}`;
  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (Object.keys(cookies).length > 0) {
    headers.set("cookie", Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  }
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Aditya Registration, Logout, and Re-Login Flow", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_FALLBACK", "true");
    vi.stubEnv("SHIELD_CORE_URL", "http://127.0.0.1:59999"); // Unreachable port to exercise offline handler
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("successfully registers, logs out, and re-logs in with aditya@zoiko.com and Aditya@20045678", async () => {
    // 1. Register organization
    const registerReq = makeReq("auth/register", {
      organizationName: "Zoiko",
      slug: "zoiko",
      fullName: "Nitta Aditya",
      email: "aditya@zoiko.com",
      password: "Aditya@20045678",
      region: "us-east-1",
    });
    const regRes = await POST(registerReq, { params: Promise.resolve({ slug: ["auth", "register"] }) });
    expect(regRes.status).toBe(200);

    // 2. Perform Logout
    const logoutReq = makeReq("auth/logout", {});
    const logoutRes = await POST(logoutReq, { params: Promise.resolve({ slug: ["auth", "logout"] }) });
    expect(logoutRes.status).toBe(200);
    const logoutCookies = logoutRes.headers.getSetCookie();
    expect(logoutCookies.some((c) => c.includes("zoiko_shield_access_token=;"))).toBe(true);

    // 3. Re-login with registered credentials
    const loginReq = makeReq("auth/login", {
      email: "aditya@zoiko.com",
      password: "Aditya@20045678",
    });
    const loginRes = await POST(loginReq, { params: Promise.resolve({ slug: ["auth", "login"] }) });
    expect(loginRes.status).toBe(200);

    const loginData = await loginRes.json();
    expect(loginData.user.email).toBe("aditya@zoiko.com");
    expect(loginData.user.fullName).toBe("Nitta Aditya");
    expect(loginData.user.role).toBe("TENANT_OWNER");
    expect(loginData.token).toBeDefined();

    // 4. Verify wrong password is still rejected
    const wrongPwReq = makeReq("auth/login", {
      email: "aditya@zoiko.com",
      password: "WrongPassword123!",
    });
    const wrongRes = await POST(wrongPwReq, { params: Promise.resolve({ slug: ["auth", "login"] }) });
    expect(wrongRes.status).toBe(401);
  });
});

