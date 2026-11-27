// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  TunnelError,
  createWebhookOnlyProxy,
  explainNgrokFailure,
  getTunnelState,
  startTunnel,
  stopTunnel,
  tunnelOriginForPort,
} from "@/lib/tunnel-manager";

const ID = "53a1d1e1-8149-47a9-bf19-249ef5c3b918";

const listen = (server: http.Server) =>
  new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
const close = (server: http.Server) => new Promise<void>((resolve) => server.close(() => resolve()));

/** A stand-in for shield-core that records what reaches it. */
async function fakeCore(status = 202, reply: unknown = { statusCode: 202, message: "accepted" }) {
  const seen: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: Buffer }> = [];
  const server = http.createServer((req, res) => {
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => parts.push(c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(parts) });
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  const port = await listen(server);
  return { seen, port, url: `http://127.0.0.1:${port}`, stop: () => close(server) };
}

describe("webhook-only gate (what ngrok exposes)", () => {
  let core: Awaited<ReturnType<typeof fakeCore>>;
  let gate: http.Server;
  let base: string;

  beforeEach(async () => {
    core = await fakeCore();
    gate = createWebhookOnlyProxy(core.url);
    base = `http://127.0.0.1:${await listen(gate)}`;
  });
  afterEach(async () => {
    await close(gate);
    await core.stop();
  });

  it("forwards a webhook POST with the exact bytes and only the signature headers", async () => {
    const raw = Buffer.from('{ "name":  "café ☃",\n "n": 1.0 }\n', "utf8"); // whitespace and non-ASCII must survive
    const res = await fetch(`${base}/api/v1/ingestion/webhooks/${ID}?junk=1`, {
      method: "POST",
      body: raw,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": "sha256=ab",
        "x-hub-signature-256": "sha256=cd",
        "x-github-delivery": "uuid-1",
        authorization: "Bearer stolen",
        cookie: "access_token=x",
        "x-tenant-id": "victim-tenant",
      },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ statusCode: 202, message: "accepted" });

    const [got] = core.seen;
    expect(got.method).toBe("POST");
    expect(got.url).toBe(`/api/v1/ingestion/webhooks/${ID}`); // query string dropped
    expect(got.body.equals(raw)).toBe(true);
    expect(got.headers["x-webhook-signature"]).toBe("sha256=ab");
    expect(got.headers["x-hub-signature-256"]).toBe("sha256=cd");
    expect(got.headers["x-github-delivery"]).toBe("uuid-1");
    expect(got.headers.authorization).toBeUndefined();
    expect(got.headers.cookie).toBeUndefined();
    expect(got.headers["x-tenant-id"]).toBeUndefined();
  });

  it("answers 404 to everything else and never contacts core", async () => {
    for (const p of [
      "/",
      "/api/v1/connectors",
      "/api/v1/auth/login",
      "/api/v1/ingestion/webhooks",
      "/api/v1/ingestion/webhooks/not-a-uuid",
      `/api/v1/ingestion/webhooks/${ID}/extra`,
      `/api/v1/ingestion/webhooks/../connectors`,
      `/api/v1/ingestion/webhooks/${ID}%2f..%2fconnectors`,
    ]) {
      const res = await fetch(`${base}${p}`, { method: "POST", body: "{}" });
      expect(res.status, p).toBe(404);
    }
    expect(core.seen).toHaveLength(0);
  });

  it("allows only POST on the webhook path", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const res = await fetch(`${base}/api/v1/ingestion/webhooks/${ID}`, { method, ...(method === "GET" ? {} : { body: "{}" }) });
      expect(res.status, method).toBe(405);
    }
    expect(core.seen).toHaveLength(0);
  });

  it("rejects a body over 1 MB", async () => {
    const res = await fetch(`${base}/api/v1/ingestion/webhooks/${ID}`, { method: "POST", body: Buffer.alloc(1024 * 1024 + 1, 97) });
    expect(res.status).toBe(413);
    expect(core.seen).toHaveLength(0);
  });

  it("relays core's decision, such as a rejected signature", async () => {
    await core.stop();
    core = await fakeCore(401, { statusCode: 401, message: "Invalid webhook HMAC signature" });
    await close(gate);
    gate = createWebhookOnlyProxy(core.url);
    base = `http://127.0.0.1:${await listen(gate)}`;
    const res = await fetch(`${base}/api/v1/ingestion/webhooks/${ID}`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe("Invalid webhook HMAC signature");
  });

  it("reports 502 when core is not running", async () => {
    await core.stop();
    const res = await fetch(`${base}/api/v1/ingestion/webhooks/${ID}`, { method: "POST", body: "{}" });
    expect(res.status).toBe(502);
    core = await fakeCore(); // so afterEach can stop it
  });
});

describe("ngrok output parsing", () => {
  it("finds the https tunnel that points at the gate", () => {
    const api = {
      tunnels: [
        { public_url: "https://a.ngrok.app", config: { addr: "http://localhost:3000" } },
        { public_url: "http://b.ngrok.app", config: { addr: "http://localhost:3099" } },
        { public_url: "https://c.ngrok.app/ignored/path", config: { addr: "http://localhost:3099" } },
      ],
    };
    expect(tunnelOriginForPort(api, 3099)).toBe("https://c.ngrok.app");
  });
  it("does not match a different port that merely ends the same", () => {
    expect(tunnelOriginForPort({ tunnels: [{ public_url: "https://a.io", config: { addr: "http://localhost:13099" } }] }, 3099)).toBeNull();
  });
  it("copes with nothing, junk and malformed urls", () => {
    for (const bad of [undefined, null, {}, { tunnels: "x" }, { tunnels: [] }, { tunnels: [{ public_url: "https://", config: { addr: ":3099" } }] }]) {
      expect(tunnelOriginForPort(bad, 3099)).toBeNull();
    }
  });
  it("turns ngrok's failures into messages a developer can act on", () => {
    expect(explainNgrokFailure('{"err":"authentication failed: ERR_NGROK_4018"}', 1).code).toBe("NGROK_NO_AUTHTOKEN");
    expect(explainNgrokFailure("ERR_NGROK_108 only one agent session", 1).code).toBe("NGROK_BUSY");
    const generic = explainNgrokFailure('{"lvl":"info","msg":"x"}\n{"lvl":"eror","err":"dial tcp: no route"}', 3);
    expect(generic.code).toBe("NGROK_FAILED");
    expect(generic.message).toContain("no route");
    expect(explainNgrokFailure("", null).message).toContain("no details");
  });
});

describe("tunnel lifecycle (with a fake ngrok program)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-ngrok-"));
  const bin = path.join(dir, "ngrok");
  const SAVED = { ...process.env };
  let apiPort = 0;
  let proxyPort = 0;
  let core: Awaited<ReturnType<typeof fakeCore>>;

  const freePort = async () => {
    const s = http.createServer();
    const p = await listen(s);
    await close(s);
    return p;
  };

  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node
const http = require("http");
const port = process.argv[3];
const mode = process.env.FAKE_NGROK_MODE || "ok";
if (mode === "noauth") { console.log(JSON.stringify({ lvl: "eror", err: "authentication failed: ERR_NGROK_4018" })); process.exit(1); }
if (mode === "crash") { console.log(JSON.stringify({ lvl: "eror", msg: "something broke" })); process.exit(2); }
if (mode === "silent") { setInterval(() => {}, 1000); }
else {
  http.createServer((q, r) => { r.setHeader("content-type", "application/json");
    r.end(JSON.stringify({ tunnels: [{ public_url: "https://fake-abc.ngrok-free.app", config: { addr: "http://localhost:" + port } }] })); })
    .listen(Number(process.env.FAKE_NGROK_API_PORT), "127.0.0.1", () => console.log(JSON.stringify({ lvl: "info", msg: "started" })));
}
process.on("SIGTERM", () => process.exit(0));
`,
    { mode: 0o755 },
  );

  beforeEach(async () => {
    apiPort = await freePort();
    proxyPort = await freePort();
    core = await fakeCore();
    Object.assign(process.env, {
      NGROK_BIN: bin,
      NGROK_API_URL: `http://127.0.0.1:${apiPort}/api/tunnels`,
      FAKE_NGROK_API_PORT: String(apiPort),
      TUNNEL_PROXY_PORT: String(proxyPort),
      SHIELD_CORE_URL: core.url,
      TUNNEL_STARTUP_TIMEOUT_MS: "4000",
      FAKE_NGROK_MODE: "ok",
    });
  });
  afterEach(async () => {
    await stopTunnel().catch(() => {});
    await core.stop();
    process.env = { ...SAVED };
  });

  const portOpen = (p: number) =>
    new Promise<boolean>((resolve) => {
      const s = http.request({ host: "127.0.0.1", port: p, method: "HEAD", path: "/" }, () => resolve(true));
      s.on("error", () => resolve(false));
      s.end();
    });

  it("starts ngrok on one click, reports the public link, and stops cleanly", async () => {
    expect(await getTunnelState()).toEqual({ running: false, url: null, managed: false });

    const state = await startTunnel();
    expect(state).toEqual({ running: true, url: "https://fake-abc.ngrok-free.app", managed: true });
    expect(await getTunnelState()).toMatchObject({ running: true, managed: true });
    expect(await portOpen(proxyPort)).toBe(true); // the gate is up

    // and the gate really forwards a webhook to core
    const res = await fetch(`http://127.0.0.1:${proxyPort}/api/v1/ingestion/webhooks/${ID}`, { method: "POST", body: '{"a":1}' });
    expect(res.status).toBe(202);
    expect(core.seen).toHaveLength(1);

    const stopped = await stopTunnel();
    expect(stopped).toEqual({ running: false, url: null, managed: false });
    expect(await portOpen(proxyPort)).toBe(false); // gate closed with it
    expect(await portOpen(apiPort)).toBe(false); // ngrok process gone
  });

  it("is safe to click twice", async () => {
    const a = await startTunnel();
    const b = await startTunnel();
    expect(b).toEqual(a);
  });

  it("says so when ngrok is not installed, and leaves nothing running", async () => {
    process.env.NGROK_BIN = path.join(dir, "does-not-exist");
    const err = await startTunnel().catch((e) => e);
    expect(err).toBeInstanceOf(TunnelError);
    expect(err.code).toBe("NGROK_NOT_INSTALLED");
    expect(await portOpen(proxyPort)).toBe(false);
  });

  it("tells you how to sign ngrok in", async () => {
    process.env.FAKE_NGROK_MODE = "noauth";
    const err = await startTunnel().catch((e) => e);
    expect(err.code).toBe("NGROK_NO_AUTHTOKEN");
    expect(err.message).toContain("add-authtoken");
    expect(await portOpen(proxyPort)).toBe(false);
  });

  it("reports a crash with ngrok's own reason", async () => {
    process.env.FAKE_NGROK_MODE = "crash";
    const err = await startTunnel().catch((e) => e);
    expect(err.code).toBe("NGROK_FAILED");
    expect(err.message).toContain("something broke");
  });

  it("gives up if ngrok never reports a link, and cleans up", async () => {
    process.env.FAKE_NGROK_MODE = "silent";
    process.env.TUNNEL_STARTUP_TIMEOUT_MS = "1200";
    const err = await startTunnel().catch((e) => e);
    expect(err.code).toBe("NGROK_TIMEOUT");
    expect(await portOpen(proxyPort)).toBe(false);
  });

  it("refuses to fight an ngrok that is already running something else", async () => {
    const other = http.createServer((q, r) => {
      r.setHeader("content-type", "application/json");
      r.end(JSON.stringify({ tunnels: [{ public_url: "https://theirs.ngrok.app", config: { addr: "http://localhost:3000" } }] }));
    });
    await new Promise<void>((resolve) => other.listen(apiPort, "127.0.0.1", () => resolve()));
    try {
      const err = await startTunnel().catch((e) => e);
      expect(err.code).toBe("NGROK_BUSY");
    } finally {
      await close(other);
    }
  });

  it("will not stop a link it did not start", async () => {
    const theirs = http.createServer((q, r) => {
      r.setHeader("content-type", "application/json");
      r.end(JSON.stringify({ tunnels: [{ public_url: "https://theirs.ngrok.app", config: { addr: `http://localhost:${proxyPort}` } }] }));
    });
    await new Promise<void>((resolve) => theirs.listen(apiPort, "127.0.0.1", () => resolve()));
    try {
      const err = await stopTunnel().catch((e) => e);
      expect(err.code).toBe("NOT_MANAGED");
    } finally {
      await close(theirs);
    }
  });

  it("explains a busy gate port", async () => {
    const squatter = http.createServer();
    await new Promise<void>((resolve) => squatter.listen(proxyPort, "127.0.0.1", () => resolve()));
    try {
      const err = await startTunnel().catch((e) => e);
      expect(err.code).toBe("PORT_IN_USE");
      expect(err.message).toContain("TUNNEL_PROXY_PORT");
    } finally {
      await close(squatter);
    }
  });
});
