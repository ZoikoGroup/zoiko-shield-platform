/**
 * Who may use the development tunnel control.
 *
 * Starting a process is not something an anonymous request may trigger, even on a
 * developer machine: `next dev` listens on the network, so anyone on the same Wi-Fi
 * could otherwise press the button. A caller must therefore:
 *   - be running a non-production build (this is absolute: no setting enables it);
 *   - come from this app's own origin (a page on another site cannot drive it);
 *   - be signed in AND able to see the connector they name, checked with shield-core
 *     using their own token, so they cannot act on someone else's connector.
 */
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type TunnelAccess = { ok: true } | { ok: false; status: number; message: string };

export async function authorizeTunnelRequest(req: Request): Promise<TunnelAccess> {
  if (process.env.NODE_ENV === "production") return { ok: false, status: 404, message: "Not found" };

  const origin = req.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === req.headers.get("host");
    } catch {
      /* malformed origin */
    }
    if (!sameOrigin) return { ok: false, status: 403, message: "Cross-origin requests are not allowed." };
  }

  const connectorId = new URL(req.url).searchParams.get("connectorId") ?? "";
  if (!UUID.test(connectorId)) return { ok: false, status: 400, message: "A valid connectorId is required." };

  const authorization = req.headers.get("authorization");
  if (!authorization) return { ok: false, status: 401, message: "Sign in to use this." };

  const tenant = req.headers.get("x-tenant-id");
  const core = process.env.SHIELD_CORE_URL || "http://127.0.0.1:3001";
  try {
    const res = await fetch(`${core}/api/v1/connectors/${connectorId}`, {
      headers: { Authorization: authorization, ...(tenant ? { "x-tenant-id": tenant } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, status: 401, message: "Your session has expired. Sign in again." };
    return { ok: false, status: 403, message: "You do not have access to this connector." };
  } catch {
    return { ok: false, status: 503, message: "Could not reach shield-core to check your access." };
  }
}
