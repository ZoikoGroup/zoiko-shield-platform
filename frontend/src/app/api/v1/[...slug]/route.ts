import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Browser -> backend proxy.
 *
 * This file used to be a proxy with roughly eighteen hundred lines of
 * fabricated responses behind it. It called the real backend, and if that
 * call did not return 2xx — for ANY reason, including 401 Unauthorized, 403,
 * 404 and 500, not just the backend being down — it fell through and answered
 * the request itself with invented data. Unmatched paths got a blanket
 * `{ success: true }`.
 *
 * The effect was that the product looked like it worked while being
 * disconnected from itself: signing in with any password returned a
 * plausible user object and a made-up token, case and alert lists were
 * populated with fictional incidents, and a write that the backend rejected
 * still reported success to the operator. Nothing in the UI distinguished
 * any of it from real data.
 *
 * So this now does only what a proxy does: forwards the request, returns
 * whatever the backend returned — including its errors — and, when the
 * backend cannot be reached at all, says so with a 502 rather than inventing
 * an answer.
 */

/** Which service owns a path. All authenticated user traffic enters via shield-core. */
function resolveServiceBaseUrl(path: string): string {
  // Public raw webhook ingestion (protected by WebhookSignatureGuard).
  if (path.startsWith("ingestion/webhooks")) {
    return process.env.SHIELD_INGEST_URL || "http://127.0.0.1:3002";
  }
  // AI and decision-rights operations.
  if (path.startsWith("ai/") || path.startsWith("copilot")) {
    return process.env.SHIELD_AI_URL || "http://127.0.0.1:3003";
  }
  return process.env.SHIELD_CORE_URL || "http://127.0.0.1:3001";
}

/**
 * Generous enough that a cold or busy backend is not mistaken for a broken
 * one. The old 1500ms was short enough that ordinary requests timed out and
 * were answered with fabricated data instead.
 */
const BACKEND_TIMEOUT_MS = Number(
  process.env.BACKEND_PROXY_TIMEOUT_MS ?? 15000,
);

/** Response headers that belong to this hop and must not be forwarded verbatim. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

async function handleApiProxy(req: NextRequest, slugArray: string[]) {
  const method = req.method;
  const path = slugArray.join("/");
  const targetUrl = `${resolveServiceBaseUrl(path)}/api/v1/${path}${req.nextUrl.search}`;

  const hasBody = method !== "GET" && method !== "HEAD";
  const rawBodyText = hasBody ? await req.text() : "";

  const outboundHeaders: Record<string, string> = {};

  const contentType = req.headers.get("content-type");
  if (hasBody) {
    outboundHeaders["Content-Type"] = contentType || "application/json";
  }

  // Only forward a tenant id the client actually has. Inventing one here
  // would make an unscoped request look like a scoped one to the backend.
  const tenantId = req.headers.get("x-tenant-id");
  if (tenantId) outboundHeaders["x-tenant-id"] = tenantId;

  const authHeader = req.headers.get("authorization");
  if (authHeader) outboundHeaders["Authorization"] = authHeader;

  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) outboundHeaders["Cookie"] = cookieHeader;

  // Webhook ingestion is signed here because the shared secret is a
  // server-side secret the browser must never hold.
  if (path.startsWith("ingestion/webhooks/")) {
    const webhookSecret = process.env.WEBHOOK_HMAC_SECRET;
    if (!webhookSecret) {
      return NextResponse.json(
        {
          statusCode: 500,
          error: "Webhook proxy is not configured",
          message:
            "WEBHOOK_HMAC_SECRET is not set, so this request cannot be signed. Set it to the same value shield-ingest uses.",
        },
        { status: 500 },
      );
    }
    // shield-ingest's WebhookSignatureGuard verifies an HMAC over
    // `${timestamp}.${nonce}.${rawBody}` and reads the timestamp from
    // x-timestamp. The previous version signed the body alone and sent the
    // timestamp as x-signature-timestamp, which the guard does not read, so
    // every webhook proxied through this route was rejected with
    // "Webhook timestamp and nonce are required" — and the rejection was then
    // hidden by the fabricated fallback that used to follow.
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = req.headers.get("x-webhook-nonce") ?? crypto.randomUUID();
    const hmac = crypto
      .createHmac("sha256", webhookSecret)
      .update(`${timestamp}.${nonce}.${rawBodyText}`)
      .digest("hex");
    outboundHeaders["x-webhook-signature"] = `sha256=${hmac}`;
    outboundHeaders["x-timestamp"] = timestamp;
    outboundHeaders["x-webhook-nonce"] = nonce;
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(targetUrl, {
      method,
      headers: outboundHeaders,
      body: hasBody ? rawBodyText : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
  } catch (error) {
    // The backend is unreachable. That is a real outage and is reported as
    // one — the caller needs to know the platform is not answering, not be
    // handed something that looks like an answer.
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        statusCode: 502,
        error: "Bad Gateway",
        message: `ZoikoShield backend did not respond for /api/v1/${path}: ${reason}`,
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  backendRes.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // Session cookies are set by shield-core on login and refresh; they have to
  // reach the browser or nothing after login is authenticated.
  const setCookie = backendRes.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) {
    responseHeaders.delete("set-cookie");
    for (const cookie of setCookie) {
      responseHeaders.append("set-cookie", cookie);
    }
  }

  // 204/205/304 must not carry a body; constructing a Response with one throws.
  const bodylessStatus = new Set([204, 205, 304]);
  if (bodylessStatus.has(backendRes.status)) {
    return new NextResponse(null, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: responseHeaders,
    });
  }

  const payload = await backendRes.arrayBuffer();
  return new NextResponse(payload, {
    status: backendRes.status,
    statusText: backendRes.statusText,
    headers: responseHeaders,
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return handleApiProxy(req, slug);
}
