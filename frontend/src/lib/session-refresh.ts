/**
 * Persistent sign-in.
 *
 * Access tokens are short-lived (15 minutes) on purpose. The backend hands out
 * a 30-day rolling refresh token alongside it (httpOnly cookie, rotated on
 * every use). This module trades one for the other whenever a request comes
 * back 401, so a user stays signed in — whatever their role — until the
 * refresh token itself is revoked or runs out.
 *
 * Rules that matter:
 *  - Refresh tokens rotate, and presenting an already-rotated one revokes the
 *    whole session family. So there must never be two refreshes in flight:
 *    one per tab (single-flight) and one across tabs (Web Locks).
 *  - Only a 401/403 from the refresh endpoint means "signed out for good". A
 *    network blip or a 5xx must not log anyone out.
 *  - Auth endpoints are never retried: a 401 from /auth/login is a wrong
 *    password, not an expired session.
 */

const STATE_KEY = "zoikoshield_demo_state";
const REFRESH_URL = "/api/v1/auth/refresh";
const LOCK_NAME = "zoiko-session-refresh";
// Matches the backend's rolling refresh-token lifetime so the route guard in
// middleware.ts does not sign the user out while the refresh token is valid.
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type RefreshResult =
  | { kind: "ok"; token: string }
  | { kind: "expired" }
  | { kind: "unavailable" };

/** Seconds-since-epoch `exp` of a JWT, or null if it is not a readable JWT. */
export function jwtExpiry(token: string | null | undefined): number | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function readStoredToken(): string {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw)?.session?.token ?? "") : "";
  } catch {
    return "";
  }
}

function writeStoredToken(token: string): void {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state?.session) return;
    state.session.token = token;
    state.session.isAuthenticated = true;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — cookies below still carry the session */
  }
}

function writeSessionCookies(token: string): void {
  try {
    const attrs = `path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
    document.cookie = `zoiko_auth=true; ${attrs}`;
    document.cookie = `zoiko_shield_access_token=${token}; ${attrs}`;
  } catch {
    /* ignore */
  }
}

/** Is this a same-origin call to the platform API? */
export function isApiUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/v1/");
  } catch {
    return false;
  }
}

/** Sign-in / sign-up / token calls, whose 401 means something other than "expired". */
export function isAuthEndpoint(url: string): boolean {
  try {
    return new URL(url, window.location.origin).pathname.startsWith("/api/v1/auth/");
  } catch {
    return false;
  }
}

async function callRefresh(rawFetch: typeof fetch): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await rawFetch(REFRESH_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (res.status === 401 || res.status === 403) return { kind: "expired" };
  if (!res.ok) return { kind: "unavailable" };
  try {
    const body = await res.json();
    const token = body?.accessToken ?? body?.data?.accessToken;
    return typeof token === "string" && token ? { kind: "ok", token } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

let inflight: Promise<RefreshResult> | null = null;

/**
 * Renew the access token. Concurrent callers share one request.
 * `staleToken` is the token the caller just had rejected: if another tab has
 * already stored a newer, still-valid one, that is used instead of burning
 * the refresh token a second time.
 */
export function refreshSession(
  staleToken: string,
  rawFetch: typeof fetch = window.fetch.bind(window)
): Promise<RefreshResult> {
  if (inflight) return inflight;

  const run = async (): Promise<RefreshResult> => {
    const current = readStoredToken();
    const exp = jwtExpiry(current);
    if (current && current !== staleToken && (exp === null || exp * 1000 > Date.now() + 5000)) {
      return { kind: "ok", token: current };
    }
    const result = await callRefresh(rawFetch);
    if (result.kind === "ok") {
      writeStoredToken(result.token);
      writeSessionCookies(result.token);
    }
    return result;
  };

  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  const guarded = locks ? locks.request(LOCK_NAME, run) : run();
  inflight = Promise.resolve(guarded).finally(() => {
    inflight = null;
  });
  return inflight;
}

let expiring = false;

/** The refresh token is gone: clear everything and send the user to sign in. */
export async function endSession(): Promise<void> {
  if (expiring || typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/login")) return;
  expiring = true;
  try {
    const { ZoikoShieldApiClient } = await import("./api-client");
    await ZoikoShieldApiClient.logout();
  } catch {
    /* fall through to the redirect, which also clears cookies */
  }
  const back = window.location.pathname + window.location.search;
  window.location.assign(
    `/login?logout=true&redirect=${encodeURIComponent(back)}&reason=session-expired`
  );
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * Wrap window.fetch so any call to /api/v1/* that comes back 401 renews the
 * session once and is replayed with the new token. Covers every caller — the
 * shared API client and the pages that call fetch directly. Idempotent.
 */
export function installSessionRefresh(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __zoikoSessionRefresh?: boolean };
  if (w.__zoikoSessionRefresh) return;
  w.__zoikoSessionRefresh = true;

  const rawFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    if (!isApiUrl(url) || isAuthEndpoint(url)) return rawFetch(input, init);

    // A Request body can only be read once, so keep a copy for the replay.
    const replayInput = input instanceof Request ? input.clone() : input;
    const res = await rawFetch(input, init);
    if (res.status !== 401) return res;

    const headers = new Headers(init?.headers ?? (replayInput instanceof Request ? replayInput.headers : undefined));
    const sent = headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? readStoredToken();

    const result = await refreshSession(sent, rawFetch);
    if (result.kind === "expired") {
      void endSession();
      return res;
    }
    if (result.kind !== "ok") return res;

    if (headers.has("Authorization")) headers.set("Authorization", `Bearer ${result.token}`);
    return rawFetch(replayInput, { ...init, headers });
  };
}
