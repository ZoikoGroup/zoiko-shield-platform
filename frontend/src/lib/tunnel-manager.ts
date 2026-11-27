import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";

/**
 * DEVELOPMENT ONLY. Starts and stops an ngrok tunnel so a webhook sender such as
 * GitHub can reach the app running on a developer's machine.
 *
 * Nothing here is reachable in production: the only caller is
 * app/api/dev/tunnel/route.ts, which refuses every request when
 * NODE_ENV === "production", and the connector card never calls it there.
 *
 * Two safeguards worth knowing:
 *  - ngrok is NOT pointed at shield-core. A tunnel to core would put the whole API
 *    (login, every route) on a public address. It is pointed at a tiny local gate
 *    that forwards exactly one thing, POST /api/v1/ingestion/webhooks/<uuid>, and
 *    answers 404 to everything else.
 *  - The command is fixed (`ngrok http <port>`). No request input reaches the
 *    process arguments.
 */

export type TunnelErrorCode =
  | "NGROK_NOT_INSTALLED"
  | "NGROK_NO_AUTHTOKEN"
  | "NGROK_BUSY"
  | "NGROK_FAILED"
  | "NGROK_TIMEOUT"
  | "PORT_IN_USE"
  | "NOT_MANAGED";

export class TunnelError extends Error {
  constructor(
    readonly code: TunnelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TunnelError";
  }
}

export interface TunnelState {
  running: boolean;
  /** https origin of the public link, without a path. */
  url: string | null;
  /** True when this app started ngrok, so it may also stop it. */
  managed: boolean;
}

function config() {
  return {
    // Where the gate forwards. shield-core by default (it hosts the public webhook route,
    // as in production). TUNNEL_TARGET_URL points it elsewhere for development only, e.g.
    // straight at shield-ingest (http://127.0.0.1:3002) when the shield-core image has not
    // been rebuilt yet. Ingest verifies the same signature, so the secret is still checked.
    core: process.env.TUNNEL_TARGET_URL || process.env.SHIELD_CORE_URL || "http://127.0.0.1:3001",
    proxyPort: Number(process.env.TUNNEL_PROXY_PORT) || 3099,
    bin: process.env.NGROK_BIN || "ngrok",
    api: process.env.NGROK_API_URL || "http://127.0.0.1:4040/api/tunnels",
    startupMs: Number(process.env.TUNNEL_STARTUP_TIMEOUT_MS) || 20_000,
  };
}

// Survives hot reloads of `next dev`, which re-evaluate this module and would
// otherwise orphan a running ngrok.
type Holder = { child: ChildProcess | null; proxy: http.Server | null };
const g = globalThis as typeof globalThis & { __zoikoTunnel?: Holder; __zoikoTunnelExitHook?: boolean };
const holder: Holder = (g.__zoikoTunnel ??= { child: null, proxy: null });
if (!g.__zoikoTunnelExitHook) {
  g.__zoikoTunnelExitHook = true;
  process.on("exit", () => {
    try {
      holder.child?.kill();
    } catch {
      /* already gone */
    }
  });
}

// ---- the gate ngrok points at -------------------------------------------

export const WEBHOOK_PATH = /^\/api\/v1\/ingestion\/webhooks\/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Same signature headers shield-core's gateway passes on; everything else is dropped. */
const FORWARDED_HEADERS = [
  "content-type",
  "x-webhook-signature",
  "x-signature",
  "x-signature-sha256",
  "x-hub-signature-256",
  "x-timestamp",
  "x-webhook-timestamp",
  "x-request-timestamp",
  "x-webhook-nonce",
  "x-github-delivery",
  "x-github-event",
];
const MAX_BODY_BYTES = 1024 * 1024;
/** GitHub's own cap on a delivery. Past this the connection is cut rather than read to the end. */
const HARD_LIMIT_BYTES = 25 * 1024 * 1024;

export function createWebhookOnlyProxy(coreUrl: string): http.Server {
  const target = new URL(coreUrl);
  return http.createServer((req, res) => {
    const reply = (status: number, message: string) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ statusCode: status, message }));
    };

    const path = (req.url ?? "").split("?")[0];
    if (!WEBHOOK_PATH.test(path)) return reply(404, "Not found");
    if (req.method !== "POST") return reply(405, "Method not allowed");

    // An oversized body is read and thrown away, and answered when it has finished arriving.
    // Replying first would let the client see a connection reset instead of the 413.
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > HARD_LIMIT_BYTES) {
        req.destroy();
        return;
      }
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0; // nothing past the limit is kept
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return reply(413, "Payload too large");
      // Buffered and sent with an explicit length: the signature covers these
      // exact bytes, so they are never re-encoded.
      const body = Buffer.concat(chunks);
      const headers: Record<string, string | number> = { "content-length": body.length };
      for (const name of FORWARDED_HEADERS) {
        const value = req.headers[name];
        if (typeof value === "string") headers[name] = value;
      }
      const upstream = http.request(
        { host: target.hostname, port: target.port || 80, path, method: "POST", headers },
        (up) => {
          const parts: Buffer[] = [];
          up.on("data", (c: Buffer) => parts.push(c));
          up.on("end", () => {
            res.writeHead(up.statusCode ?? 502, {
              "content-type": String(up.headers["content-type"] ?? "application/json"),
            });
            res.end(Buffer.concat(parts));
          });
        },
      );
      upstream.on("error", () => reply(502, "shield-core is not reachable"));
      upstream.end(body);
    });
    req.on("error", () => reply(400, "Bad request"));
  });
}

async function ensureProxy(): Promise<void> {
  if (holder.proxy?.listening) return;
  const { core, proxyPort } = config();
  const server = createWebhookOnlyProxy(core);
  await new Promise<void>((resolve, reject) => {
    server.once("error", (e: NodeJS.ErrnoException) =>
      reject(
        e.code === "EADDRINUSE"
          ? new TunnelError("PORT_IN_USE", `Port ${proxyPort} is already in use. Set TUNNEL_PROXY_PORT to a free port and restart.`)
          : e,
      ),
    );
    server.listen(proxyPort, "127.0.0.1", () => resolve());
  });
  holder.proxy = server;
}

async function closeProxy(): Promise<void> {
  const server = holder.proxy;
  holder.proxy = null;
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
}

// ---- ngrok ----------------------------------------------------------------

/** ngrok's local API lists its tunnels; find the https one that forwards to our gate. */
export function tunnelOriginForPort(api: unknown, port: number): string | null {
  const tunnels = (api as { tunnels?: unknown })?.tunnels;
  if (!Array.isArray(tunnels)) return null;
  for (const t of tunnels as Array<{ public_url?: unknown; config?: { addr?: unknown } }>) {
    const url = typeof t?.public_url === "string" ? t.public_url : "";
    if (!url.startsWith("https://")) continue;
    if (!String(t?.config?.addr ?? "").endsWith(`:${port}`)) continue;
    try {
      return new URL(url).origin;
    } catch {
      /* malformed, keep looking */
    }
  }
  return null;
}

async function readStatus(): Promise<{ apiUp: boolean; url: string | null }> {
  const { api, proxyPort } = config();
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(1500) });
    return { apiUp: true, url: tunnelOriginForPort(await res.json(), proxyPort) };
  } catch {
    return { apiUp: false, url: null };
  }
}

function managed(): boolean {
  return Boolean(holder.child && holder.child.exitCode === null && !holder.child.killed);
}

/** Turn ngrok's own log into a message a developer can act on. */
export function explainNgrokFailure(log: string, exitCode: number | null): TunnelError {
  if (/ERR_NGROK_4018|authtoken|authentication failed/i.test(log)) {
    return new TunnelError(
      "NGROK_NO_AUTHTOKEN",
      "ngrok is not signed in. Run `ngrok config add-authtoken <your token>` once (free token at dashboard.ngrok.com), then try again.",
    );
  }
  if (/ERR_NGROK_(108|334)|only one agent session|already online/i.test(log)) {
    return new TunnelError("NGROK_BUSY", "ngrok is already running somewhere else on this account. Stop it, then try again.");
  }
  const lines = log
    .split("\n")
    .map((l) => {
      try {
        const j = JSON.parse(l);
        return String(j.err ?? j.msg ?? "");
      } catch {
        return l;
      }
    })
    .filter(Boolean);
  return new TunnelError("NGROK_FAILED", `ngrok stopped (${exitCode ?? "no code"}): ${lines.at(-1) ?? "no details"}`.slice(0, 300));
}

export async function getTunnelState(): Promise<TunnelState> {
  const { url } = await readStatus();
  // A tunnel to our gate port can outlive the dev server that opened it (a restart that
  // did not stop ngrok). Without the gate behind it that link is dead, so bring the gate
  // back: the tunnel was ours, and the gate is exactly what it is meant to reach.
  if (url && !holder.proxy?.listening) await ensureProxy().catch(() => {});
  return { running: Boolean(url), url, managed: managed() };
}

export async function startTunnel(): Promise<TunnelState> {
  const c = config();
  await ensureProxy();

  const existing = await readStatus();
  if (existing.url) return { running: true, url: existing.url, managed: managed() };
  if (existing.apiUp) {
    throw new TunnelError(
      "NGROK_BUSY",
      "ngrok is already running with a different tunnel. Stop that one (close its terminal), then try again.",
    );
  }

  const child = spawn(c.bin, ["http", String(c.proxyPort), "--log=stdout", "--log-format=json"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  holder.child = child;
  let log = "";
  const collect = (b: Buffer) => {
    log = (log + b.toString()).slice(-4000);
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  child.once("exit", () => {
    if (holder.child === child) holder.child = null;
  });

  try {
    const url = await new Promise<string>((resolve, reject) => {
      let finished = false;
      let timer: NodeJS.Timeout | undefined;
      const end = (fn: () => void) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        fn();
      };
      child.once("error", (e: NodeJS.ErrnoException) =>
        end(() =>
          reject(
            e.code === "ENOENT"
              ? new TunnelError("NGROK_NOT_INSTALLED", "ngrok is not installed or not on PATH. Install it from ngrok.com/download, or set NGROK_BIN.")
              : e,
          ),
        ),
      );
      child.once("exit", (code) => end(() => reject(explainNgrokFailure(log, code))));
      const started = Date.now();
      const poll = async () => {
        if (finished) return;
        const s = await readStatus();
        if (s.url) return end(() => resolve(s.url as string));
        if (Date.now() - started > c.startupMs) {
          return end(() => reject(new TunnelError("NGROK_TIMEOUT", "ngrok did not report a public link in time. Check your internet connection.")));
        }
        timer = setTimeout(poll, 400);
      };
      void poll();
    });
    return { running: true, url, managed: true };
  } catch (error) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    holder.child = null;
    await closeProxy();
    throw error;
  }
}

export async function stopTunnel(): Promise<TunnelState> {
  if (holder.child && holder.child.exitCode === null) {
    holder.child.kill("SIGTERM");
    holder.child = null;
    await closeProxy();
    return { running: false, url: null, managed: false };
  }
  if ((await readStatus()).url) {
    throw new TunnelError("NOT_MANAGED", "This link was started outside the app. Stop it in the terminal where ngrok is running.");
  }
  await closeProxy();
  return { running: false, url: null, managed: false };
}
