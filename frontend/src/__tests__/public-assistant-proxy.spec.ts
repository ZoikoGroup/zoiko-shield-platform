// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/public/chat/v1/[...path]/route";

function call(path: string, options: { cookie?: string } = {}) {
  return POST(
    new NextRequest(`http://localhost:3000/api/public/chat/v1/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        authorization: "Bearer tenant-token",
        "x-tenant-id": "tenant-acme",
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: JSON.stringify({ journey: "demo" }),
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
}

describe("public assistant proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards only the assistant cookie and adds the CSRF header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ ok: true }, { status: 200 }),
    );

    const response = await call("submissions/keys", {
      cookie: "zoiko_auth=true; zs_pa_sid=assistant-session; shield_access_token=tenant",
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:3006/api/public/chat/v1/submissions/keys");
    const headers = new Headers(init?.headers);
    expect(headers.get("cookie")).toBe("zs_pa_sid=assistant-session");
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-tenant-id")).toBeNull();
    expect(headers.get("x-zs-assistant")).toBe("1");
    expect(headers.get("origin")).toBe("http://localhost:3000");
  });

  it("returns a real 503 instead of inventing a success when the assistant is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    const response = await call("sessions");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error_code).toBe("ASSISTANT_UNAVAILABLE");
    expect(response.headers.get("x-zoiko-proxy")).toBe("public-assistant");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects path traversal before calling the upstream", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/public/chat/v1/../admin", { method: "GET" }),
      { params: Promise.resolve({ path: ["..", "admin"] }) },
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
