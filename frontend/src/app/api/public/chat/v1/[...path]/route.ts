import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Strict same-origin proxy for the public assistant BFF.
 *
 * Unlike `app/api/v1/[...slug]`, this route never fabricates a response. If the
 * assistant is down the caller gets a real 503 and the UI shows its fallback.
 * Cookies other than the assistant's own are stripped, as are authorization and
 * tenant headers.
 */
const BASE_URL = process.env.PUBLIC_ASSISTANT_URL || "http://127.0.0.1:3006";
const UPSTREAM_PREFIX = "/api/public/chat/v1";
const ASSISTANT_COOKIE = "zs_pa_sid";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "expect",
]);

const STRIPPED_REQUEST_HEADERS = new Set([
  "authorization",
  "x-tenant-id",
  "x-zoiko-tenant-id",
  "cookie",
]);

function unavailable() {
  return Response.json(
    {
      error_code: "ASSISTANT_UNAVAILABLE",
      user_safe_message:
        "The assistant is temporarily unavailable. You can still explore the site or contact support.",
    },
    {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "x-zoiko-proxy": "public-assistant",
      },
    },
  );
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  if (path.some((segment) => !segment || segment === "." || segment === "..")) {
    return Response.json(
      { error_code: "BAD_PATH", user_safe_message: "That request is not available." },
      { status: 400, headers: { "x-zoiko-proxy": "public-assistant" } },
    );
  }

  const target = `${BASE_URL}${UPSTREAM_PREFIX}/${path.join("/")}${request.nextUrl.search}`;
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (HOP_BY_HOP.has(name) || STRIPPED_REQUEST_HEADERS.has(name)) return;
    headers.set(name, value);
  });

  // Forward only the assistant's own cookie.
  const assistantCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name === ASSISTANT_COOKIE);
  if (assistantCookies.length > 0) {
    headers.set(
      "cookie",
      assistantCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    );
  }

  // Every mutation carries the CSRF header. Adding it here means a direct
  // browser call that forgot it is still rejected upstream, not silently fixed.
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("x-zs-assistant", "1");
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    console.error(
      "[public-assistant-proxy] upstream request failed",
      request.method,
      path.join("/"),
      error instanceof Error ? `${error.name}: ${error.message}` : error,
      (error as { cause?: unknown })?.cause,
    );
    return unavailable();
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (HOP_BY_HOP.has(name) || name === "set-cookie") return;
    responseHeaders.set(key, value);
  });
  responseHeaders.set("x-zoiko-proxy", "public-assistant");
  responseHeaders.set("cache-control", "no-store");

  const setCookies =
    typeof (upstream.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (upstream.headers as { getSetCookie: () => string[] }).getSetCookie()
      : [];
  for (const cookie of setCookies) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
