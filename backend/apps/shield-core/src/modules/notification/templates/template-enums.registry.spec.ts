import {
  resolveAllowlistedStatus,
  resolveAllowlistedRole,
  resolveAllowlistedActionType,
} from './template-enums.registry';

describe('template enum humanization (Gate 2 allowlist)', () => {
  it('prefers the curated allowlist label', () => {
    expect(resolveAllowlistedStatus('EXECUTED_AUTOMATICALLY')).toBe(
      'Executed Automatically',
    );
    expect(resolveAllowlistedStatus('CRITICAL_INCIDENT_OPENED')).toBe(
      'Critical Incident Opened',
    );
  });

  it('is case and separator insensitive', () => {
    expect(resolveAllowlistedStatus('executed-automatically')).toBe(
      'Executed Automatically',
    );
  });

  // Regression: a blanket .toLowerCase() in the fallback rendered security
  // acronyms as 'Sso Saml Configured', 'Dkim Aligned', 'Ip Blocked' in
  // customer-facing email copy.
  it.each([
    ['SSO_SAML_CONFIGURED', 'SSO SAML Configured'],
    ['DKIM_ALIGNED', 'DKIM Aligned'],
    ['IP_BLOCKED', 'IP Blocked'],
    ['TLS_HANDSHAKE_FAILED', 'TLS Handshake Failed'],
    ['SCIM_SYNC_PAUSED', 'SCIM Sync Paused'],
    ['JIT_GRANT_EXPIRED', 'JIT Grant Expired'],
  ])('preserves acronyms in the fallback: %s -> %s', (raw, expected) => {
    expect(resolveAllowlistedStatus(raw)).toBe(expected);
  });

  it('title-cases ordinary words in the fallback', () => {
    expect(resolveAllowlistedStatus('SOME_UNMAPPED_BACKEND_CODE')).toBe(
      'Some Unmapped Backend Code',
    );
  });

  it('never leaks a raw SCREAMING_SNAKE_CASE code to the customer', () => {
    const resolved = resolveAllowlistedStatus('TOTALLY_UNKNOWN_INTERNAL_STATE');
    expect(resolved).not.toContain('_');
    expect(resolved).toBe('Totally Unknown Internal State');
  });

  it('falls back safely on empty input', () => {
    expect(resolveAllowlistedStatus('')).toBe('Active');
    expect(resolveAllowlistedRole('')).toBe('Standard Member');
    expect(resolveAllowlistedActionType('')).toBe('Governed Response Action');
  });
});
