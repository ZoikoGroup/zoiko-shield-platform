/**
 * shield-core scopes the refresh_token cookie to `Path=/auth`, but the browser
 * only ever reaches it through the Next proxy at `/api/v1/auth/*`. A cookie
 * whose path is `/auth` is never sent to `/api/v1/auth/refresh`, so silent
 * session renewal could not work. Re-scope it to the path the browser really
 * calls. Only the refresh cookie is touched.
 */
export function rewriteRefreshCookiePath(cookie: string): string {
  if (!/^\s*refresh_token=/i.test(cookie)) return cookie;
  return cookie.replace(/;\s*Path=\/auth(?=;|$)/i, "; Path=/api/v1/auth");
}
