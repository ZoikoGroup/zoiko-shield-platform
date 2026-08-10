/**
 * Controlled stable scope registry (spec §33). action:execute / shield-action
 * access is deliberately never exposed through ordinary developer clients
 * this release.
 */
export const API_SCOPES = [
  'alerts:read',
  'cases:read',
  'cases:write',
  'evidence:read',
  'controls:read',
  'assessments:read',
  'risks:read',
  'audit_packages:read',
  'reports:read',
  'exports:create',
  'exports:read',
  'webhooks:manage',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isKnownScope(scope: string): scope is ApiScope {
  return (API_SCOPES as readonly string[]).includes(scope);
}
