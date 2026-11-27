import { INBOUND_WEBHOOK_PROVIDERS, isInboundWebhookReceiver } from './webhook-receiver';

describe('isInboundWebhookReceiver', () => {
  it('is true for the push-only providers', () => {
    expect(isInboundWebhookReceiver('generic-webhook')).toBe(true);
    expect(isInboundWebhookReceiver('github')).toBe(true);
  });

  it('is false for pull-style providers, which have scopes, polling and heartbeats', () => {
    for (const p of ['okta', 'microsoft-entra', 'aws-cloudtrail', 'crowdstrike', 'generic-syslog', 'snyk']) {
      expect(isInboundWebhookReceiver(p)).toBe(false);
    }
  });

  it('is false for nothing at all', () => {
    for (const v of [undefined, null, '']) expect(isInboundWebhookReceiver(v)).toBe(false);
  });

  it('matches exactly (no prefixes or case folding)', () => {
    expect(isInboundWebhookReceiver('GitHub')).toBe(false);
    expect(isInboundWebhookReceiver('github-enterprise')).toBe(false);
    expect([...INBOUND_WEBHOOK_PROVIDERS].sort()).toEqual(['generic-webhook', 'github']);
  });
});
