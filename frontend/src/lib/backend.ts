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
  const state = getInitialDemoState();
  const headers: Record<string, string> = {};
  // Only a tenant the client actually has. Inventing one makes an unscoped
  // request look scoped to the backend.
  if (state.tenant?.id) headers["x-tenant-id"] = state.tenant.id;
  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
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
  get: <T>(path: string) => request<T>(path),
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
