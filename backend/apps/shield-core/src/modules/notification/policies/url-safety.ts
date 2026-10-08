import { BadRequestException } from '@nestjs/common';

/**
 * Shared CTA URL safety enforcement (ZS-EML-TPL-001 v2.0 Gate 3 — Action Safety).
 *
 * This is the single authoritative implementation. Both the pre-send
 * TenantIsolationValidator and the template engine's post-resolution CTA check
 * delegate here, so an email can never acquire a hostile action link by
 * arriving through a variable key that one call site forgot to enumerate.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Schemes that must never appear in an outbound action link. */
const EXPLICITLY_FORBIDDEN_SCHEMES = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
]);

function loopbackHttpPermitted(): boolean {
  // Loopback HTTP is a local-development affordance only. Production and any
  // production-like environment must fail closed on non-HTTPS action links.
  return process.env.NODE_ENV !== 'production';
}

/**
 * Fail-closed validation of a customer-facing call-to-action URL.
 * Throws BadRequestException on any unsafe or unparseable value.
 */
export function assertSafeCtaUrl(rawUrl: string, contextLabel = 'CTA URL'): void {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new BadRequestException(
      `Action safety violation: ${contextLabel} is empty or not a string.`,
    );
  }

  // Control characters (including CR/LF) must never reach a mail header,
  // an HTML attribute, or the plaintext body.
  if (/[\u0000-\u001f\u007f]/.test(rawUrl)) {
    throw new BadRequestException(
      `Action safety violation: ${contextLabel} contains control characters.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err: any) {
    throw new BadRequestException(
      `Malformed ${contextLabel} in email render context: ${err.message}`,
    );
  }

  if (EXPLICITLY_FORBIDDEN_SCHEMES.has(parsed.protocol)) {
    throw new BadRequestException(
      `Action safety violation: ${contextLabel} uses a forbidden scheme '${parsed.protocol}'.`,
    );
  }

  // Embedded credentials let "https://app.zoikoshield.com@evil.example" read as
  // a first-party link in the plaintext body while resolving to the attacker host.
  if (parsed.username || parsed.password) {
    throw new BadRequestException(
      `Action safety violation: ${contextLabel} must not embed credentials.`,
    );
  }

  const isLoopback = LOOPBACK_HOSTNAMES.has(parsed.hostname);
  const loopbackHttpAllowed =
    isLoopback && parsed.protocol === 'http:' && loopbackHttpPermitted();

  if (parsed.protocol !== 'https:' && !loopbackHttpAllowed) {
    throw new BadRequestException(
      `Action safety violation: ${contextLabel} must use HTTPS protocol. Received: ${parsed.protocol}`,
    );
  }
}

/**
 * Non-throwing variant for callers that need to probe a candidate value.
 */
export function isSafeCtaUrl(rawUrl: string): boolean {
  try {
    assertSafeCtaUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}
