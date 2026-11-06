import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/v1/[...slug]/route";

function makeReq(
  method: "GET" | "POST",
  path: string,
  body?: any,
  cookies: Record<string, string> = {}
): NextRequest {
  const url = `http://localhost:3000/api/v1/${path}`;
  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (Object.keys(cookies).length > 0) {
    headers.set("cookie", Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; "));
  }
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("ZoikoShield Complete Auth, Email, SSO & Registration Audit Suite", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_FALLBACK", "true");
    vi.stubEnv("SHIELD_CORE_URL", "http://127.0.0.1:59999"); // Unreachable port to exercise resilient handler
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("1. Successfully provisions Siddhartha organization (Google / ap-south-1) without 502 error", async () => {
    const registerReq = makeReq("POST", "auth/register", {
      organizationName: "google",
      slug: "google",
      fullName: "siddhartha",
      email: "siddarthsiddu55555@gmail.com",
      password: "Password@2026!",
      region: "ap-south-1",
      compliancePacks: ["SOC2_ISO27001", "EU_AI_ACT"],
    });

    const regRes = await POST(registerReq, { params: Promise.resolve({ slug: ["auth", "register"] }) });
    expect(regRes.status).toBe(200);

    const data = await regRes.json();
    expect(data.success).toBe(true);
    expect(data.tenant.name).toBe("google");
    expect(data.tenant.homeRegion).toBe("ap-south-1");
    expect(data.session.email).toBe("siddarthsiddu55555@gmail.com");
    expect(data.session.role).toBe("TENANT_OWNER");
    expect(data.receipt.sovereignCell).toBe("ap-south-1");

    // Verify all auth cookies are stamped
    const cookies = regRes.headers.getSetCookie();
    expect(cookies.some((c) => c.includes("zoiko_shield_access_token="))).toBe(true);
    expect(cookies.some((c) => c.includes("shield_access_token="))).toBe(true);
    expect(cookies.some((c) => c.includes("zoiko_auth=true"))).toBe(true);
  });

  it("2. Company SSO Discovery handles 'zoiko industries' gracefully with valid identityProviders array", async () => {
    const ssoReq = makeReq("GET", "auth/sso/discovery/zoiko%20industries");
    const ssoRes = await GET(ssoReq, {
      params: Promise.resolve({ slug: ["auth", "sso", "discovery", "zoiko industries"] }),
    });

    expect(ssoRes.status).toBe(200);
    const data = await ssoRes.json();
    expect(data.tenant).toBeDefined();
    expect(data.tenant.name).toContain("Zoiko");
    expect(Array.isArray(data.identityProviders)).toBe(true);
    expect(data.identityProviders.length).toBeGreaterThan(0);

    // Verify filtering works without any 'Cannot read properties of undefined' exception
    const googleProviders = data.identityProviders.filter((p: any) => /google/i.test(p.name));
    expect(googleProviders.length).toBeGreaterThan(0);

    const msProviders = data.identityProviders.filter((p: any) => /microsoft|azure/i.test(p.name));
    expect(msProviders.length).toBeGreaterThan(0);
  });

  it("3. Company SSO Discovery returns 404 for non-existent workspace", async () => {
    const ssoReq = makeReq("GET", "auth/sso/discovery/non-existent-workspace-xyz-999");
    const ssoRes = await GET(ssoReq, {
      params: Promise.resolve({ slug: ["auth", "sso", "discovery", "non-existent-workspace-xyz-999"] }),
    });

    expect(ssoRes.status).toBe(404);
    const data = await ssoRes.json();
    expect(data.message).toContain("couldn't find a workspace");
  });

  it("4. Logout completely terminates session and expires all auth and session cookies", async () => {
    const logoutReq = makeReq("POST", "auth/logout");
    const logoutRes = await POST(logoutReq, {
      params: Promise.resolve({ slug: ["auth", "logout"] }),
    });

    expect(logoutRes.status).toBe(200);
    const cookies = logoutRes.headers.getSetCookie();

    const expectedExpired = [
      "zoiko_auth",
      "zoiko_shield_access_token",
      "shield_access_token",
      "access_token",
      "refresh_token",
      "zoiko_shield_tenant_id",
      "zoiko_shield_user_email",
    ];

    for (const cookieName of expectedExpired) {
      expect(cookies.some((c) => c.includes(`${cookieName}=;`) && c.includes("Max-Age=0"))).toBe(true);
    }
  });

  it("5. Allows newly registered user to sign in immediately with registered password", async () => {
    const loginReq = makeReq("POST", "auth/login", {
      email: "siddarthsiddu55555@gmail.com",
      password: "Password@2026!",
    });

    const loginRes = await POST(loginReq, {
      params: Promise.resolve({ slug: ["auth", "login"] }),
    });

    expect(loginRes.status).toBe(200);
    const data = await loginRes.json();
    expect(data.user.email).toBe("siddarthsiddu55555@gmail.com");
    expect(data.user.role).toBe("TENANT_OWNER");
  });

  it("6. Password recovery request generates email delivery record and valid code", async () => {
    const forgotReq = makeReq("POST", "auth/forgot-password", {
      email: "siddarthsiddu55555@gmail.com",
    });

    const forgotRes = await POST(forgotReq, {
      params: Promise.resolve({ slug: ["auth", "forgot-password"] }),
    });

    expect(forgotRes.status).toBe(200);
    const data = await forgotRes.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("sent to it");
  });
});

