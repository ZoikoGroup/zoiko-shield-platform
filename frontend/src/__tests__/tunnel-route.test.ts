// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manager = vi.hoisted(() => ({
  getTunnelState: vi.fn(),
  startTunnel: vi.fn(),
  stopTunnel: vi.fn(),
}));
vi.mock("@/lib/tunnel-manager", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tunnel-manager")>("@/lib/tunnel-manager");
  return { ...actual, ...manager };
});

import { authorizeTunnelRequest } from "@/lib/tunnel-access";
import { DELETE, GET, POST } from "@/app/api/dev/tunnel/route";
import { TunnelError } from "@/lib/tunnel-manager";

const ID = "53a1d1e1-8149-47a9-bf19-249ef5c3b918";
const URL_OK = `http://localhost:3000/api/dev/tunnel?connectorId=${ID}`;
const env = process.env as Record<string, string | undefined>;
const SAVED_NODE_ENV = env.NODE_ENV;

const req = (init: { url?: string; method?: string; headers?: Record<string, string> } = {}) =>
  new Request(init.url ?? URL_OK, {
    method: init.method ?? "GET",
    headers: { host: "localhost:3000", authorization: "Bearer good", "x-tenant-id": "tenant-1", ...(init.headers ?? {}) },
  });

describe("authorizeTunnelRequest", () => {
  let coreFetch: ReturnType<typeof vi.fn>;
  const realFetch = global.fetch;
  beforeEach(() => {
    env.NODE_ENV = "development";
    coreFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    global.fetch = coreFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    env.NODE_ENV = SAVED_NODE_ENV;
    global.fetch = realFetch;
  });

  it("allows a signed-in user who can see the connector, and checks with THEIR token", async () => {
    expect(await authorizeTunnelRequest(req())).toEqual({ ok: true });
    const [url, init] = coreFetch.mock.calls[0];
    expect(String(url)).toMatch(new RegExp(`/api/v1/connectors/${ID}$`));
    expect(init.headers).toMatchObject({ Authorization: "Bearer good", "x-tenant-id": "tenant-1" });
  });

  it("PRODUCTION: refuses everything with 404, even a perfectly valid request, without calling core", async () => {
    env.NODE_ENV = "production";
    expect(await authorizeTunnelRequest(req())).toMatchObject({ ok: false, status: 404 });
    expect(coreFetch).not.toHaveBeenCalled();
  });

  it("rejects a request from another origin (a web page driving your localhost)", async () => {
    expect(await authorizeTunnelRequest(req({ headers: { origin: "https://evil.example" } }))).toMatchObject({ ok: false, status: 403 });
    expect(await authorizeTunnelRequest(req({ headers: { origin: "not a url" } }))).toMatchObject({ ok: false, status: 403 });
    expect(await authorizeTunnelRequest(req({ headers: { origin: "http://localhost:3000" } }))).toEqual({ ok: true });
    expect(coreFetch).toHaveBeenCalledTimes(1);
  });

  it("needs a valid connector id", async () => {
    for (const bad of ["", "abc", `${ID}/../x`, "x".repeat(300)]) {
      const r = await authorizeTunnelRequest(req({ url: `http://localhost:3000/api/dev/tunnel?connectorId=${encodeURIComponent(bad)}` }));
      expect(r).toMatchObject({ ok: false, status: 400 });
    }
    expect(await authorizeTunnelRequest(req({ url: "http://localhost:3000/api/dev/tunnel" }))).toMatchObject({ status: 400 });
  });

  it("needs a signed-in user", async () => {
    const r = new Request(URL_OK, { headers: { host: "localhost:3000" } });
    expect(await authorizeTunnelRequest(r)).toMatchObject({ ok: false, status: 401 });
    expect(coreFetch).not.toHaveBeenCalled();
  });

  it("maps shield-core's answer: expired session, no access, unreachable", async () => {
    coreFetch.mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await authorizeTunnelRequest(req())).toMatchObject({ status: 401 });
    for (const status of [403, 404]) {
      coreFetch.mockResolvedValue(new Response("{}", { status }));
      expect(await authorizeTunnelRequest(req())).toMatchObject({ ok: false, status: 403 });
    }
    coreFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await authorizeTunnelRequest(req())).toMatchObject({ ok: false, status: 503 });
  });
});

describe("/api/dev/tunnel route", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    env.NODE_ENV = "development";
    global.fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })) as unknown as typeof fetch;
    Object.values(manager).forEach((m) => m.mockReset());
  });
  afterEach(() => {
    env.NODE_ENV = SAVED_NODE_ENV;
    global.fetch = realFetch;
  });

  it("GET returns the current state, uncacheable", async () => {
    manager.getTunnelState.mockResolvedValue({ running: false, url: null, managed: false });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ running: false, url: null, managed: false });
  });

  it("POST starts and DELETE stops", async () => {
    manager.startTunnel.mockResolvedValue({ running: true, url: "https://x.ngrok.app", managed: true });
    manager.stopTunnel.mockResolvedValue({ running: false, url: null, managed: false });
    expect((await (await POST(req({ method: "POST" }))).json()).url).toBe("https://x.ngrok.app");
    expect((await (await DELETE(req({ method: "DELETE" }))).json()).running).toBe(false);
  });

  it("turns tunnel errors into actionable messages with the right status", async () => {
    const cases: Array<[ConstructorParameters<typeof TunnelError>[0], number]> = [
      ["NGROK_NOT_INSTALLED", 424],
      ["NGROK_NO_AUTHTOKEN", 424],
      ["NGROK_BUSY", 409],
      ["PORT_IN_USE", 409],
      ["NGROK_TIMEOUT", 504],
      ["NGROK_FAILED", 502],
    ];
    for (const [code, status] of cases) {
      manager.startTunnel.mockRejectedValue(new TunnelError(code, `msg for ${code}`));
      const res = await POST(req({ method: "POST" }));
      expect(res.status, code).toBe(status);
      expect(await res.json()).toEqual({ message: `msg for ${code}`, code });
    }
  });

  it("hides the detail of an unexpected error", async () => {
    manager.startTunnel.mockRejectedValue(new Error("secret internal path /home/x"));
    const res = await POST(req({ method: "POST" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("/home/x");
  });

  it("PRODUCTION: every method is a 404 and the manager is never touched", async () => {
    env.NODE_ENV = "production";
    for (const [fn, method] of [[GET, "GET"], [POST, "POST"], [DELETE, "DELETE"]] as const) {
      expect((await fn(req({ method }))).status, method).toBe(404);
    }
    expect(manager.getTunnelState).not.toHaveBeenCalled();
    expect(manager.startTunnel).not.toHaveBeenCalled();
    expect(manager.stopTunnel).not.toHaveBeenCalled();
  });

  it("does nothing for an unauthenticated caller", async () => {
    const res = await POST(new Request(URL_OK, { method: "POST", headers: { host: "localhost:3000" } }));
    expect(res.status).toBe(401);
    expect(manager.startTunnel).not.toHaveBeenCalled();
  });
});
