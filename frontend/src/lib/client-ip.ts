/**
 * The client address as recorded by the load balancers in front of this
 * server. X-Forwarded-For is client-controlled except for the entries our own
 * proxies append, so with TRUSTED_PROXY_HOPS=N the client is the Nth entry
 * from the right. With no trusted hops configured (the default) nothing is
 * forwarded: a spoofable address would let anyone dodge rate limits.
 */
export function trustedClientIp(forwardedFor: string | null, hops = Number(process.env.TRUSTED_PROXY_HOPS) || 0): string | undefined {
  if (!forwardedFor || hops < 1) return undefined;
  const entries = forwardedFor.split(",").map((e) => e.trim()).filter(Boolean);
  return entries.length >= hops ? entries[entries.length - hops] : undefined;
}
