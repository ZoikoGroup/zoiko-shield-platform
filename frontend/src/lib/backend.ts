import { getInitialDemoState } from "./demo-state";

/**
 * Typed access to the backend through the /api/v1 proxy.
 *
 * Distinct from ZoikoShieldApiClient, which carries a fabricated-data fallback
 * for every call (now off by default, but still there). Surfaces built against
 * this helper have no fallback at all: a failed call throws and the page shows
 * the failure. For screens whose whole job is to show the control posture, a
 * plausible-looking answer is worse than an error — an operator cannot tell it
 * apart from the truth.
 */

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

function tenantHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("zoikoshield_demo_state");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.tenant?.id) headers["x-tenant-id"] = parsed.tenant.id;
        if (parsed?.session?.token) headers["Authorization"] = `Bearer ${parsed.session.token}`;
      }
    } catch {}

    if (!headers["Authorization"]) {
      const tokenMatch = document.cookie.match(
        /(?:zoiko_shield_access_token|shield_access_token|access_token)=([^;]+)/,
      );
      if (tokenMatch?.[1]) {
        headers["Authorization"] = `Bearer ${decodeURIComponent(tokenMatch[1].trim())}`;
      }
    }

    if (!headers["x-tenant-id"]) {
      const tenantMatch = document.cookie.match(/zoiko_shield_tenant_id=([^;]+)/);
      if (tenantMatch?.[1]) {
        headers["x-tenant-id"] = decodeURIComponent(tenantMatch[1].trim());
      }
    }
  }

  if (!headers["Authorization"] || !headers["x-tenant-id"]) {
    const fallback = getInitialDemoState();
    if (!headers["x-tenant-id"] && fallback.tenant?.id) {
      headers["x-tenant-id"] = fallback.tenant.id;
    }
    if (!headers["Authorization"] && fallback.session?.token) {
      headers["Authorization"] = `Bearer ${fallback.session.token}`;
    }
  }

  return headers;
}

interface RequestOptions {
  /**
   * Reject demo data the /api/v1 proxy serves when the backend is down
   * (marked with x-zoiko-fallback), instead of returning it as if it were real.
   */
  live?: boolean;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...tenantHeaders(),
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers as Record<string, string>),
      },
    });
  } catch (err) {
    throw new BackendError(
      `ZoikoShield backend is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      null,
      path,
    );
  }

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      message = body?.message || message;
    } catch {
      // Non-JSON error body; the status is what matters.
    }
    throw new BackendError(message, response.status, path);
  }

  if (options.live && response.headers.get("x-zoiko-fallback") === "true") {
    throw new BackendError("ZoikoShield backend is unreachable; demo data withheld.", null, path);
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json();
  // Controllers are inconsistent: some wrap in { statusCode, data }, some
  // return the payload directly. Unwrap when wrapped, pass through otherwise.
  if (body && typeof body === "object" && "data" in body && body.data !== undefined) {
    return body.data as T;
  }
  return body as T;
}

export const backend = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, {}, options),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

/** Always an array, whatever shape the controller returned. */
export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    for (const key of ["items", "results", "records", "data"]) {
      const inner = (value as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner as T[];
    }
  }
  return [];
}
