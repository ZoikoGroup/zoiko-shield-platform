/**
 * Connectors that only RECEIVE pushed webhooks (a sender posts signed events to us).
 *
 * They are judged differently from pull-style connectors (Okta, Entra, CloudTrail …),
 * which hold OAuth scopes, poll a provider and send heartbeats. A webhook receiver has
 * none of those: there is nothing to sync, no scope to be granted or revoked, and no
 * heartbeat, because events arrive only when something happens.
 *
 * Applying the pull-style rules to them made every webhook connector look broken:
 * permission drift flagged scopes nobody can grant, the heartbeat job would have
 * flagged any quiet period, and "Sync now" ran a pull that can only fail.
 *
 * Mirrors the rule testConnector already used: these providers have no adapter.
 */
export const INBOUND_WEBHOOK_PROVIDERS: ReadonlySet<string> = new Set([
  'generic-webhook',
  'github',
]);

export function isInboundWebhookReceiver(
  provider: string | null | undefined,
): boolean {
  return Boolean(provider) && INBOUND_WEBHOOK_PROVIDERS.has(provider as string);
}

/** Where a receiver's signing secret comes from. NONE means it cannot verify deliveries. */
export type SigningSecretSource = 'CONNECTOR' | 'OPERATOR' | 'SHARED_DEV' | 'NONE';
