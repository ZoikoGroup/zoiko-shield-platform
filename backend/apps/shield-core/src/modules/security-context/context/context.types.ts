export type ContextHealth =
  'RESOLVED' | 'PARTIAL' | 'AMBIGUOUS' | 'UNRESOLVED' | 'STALE';

export interface ResolvedContext {
  eventId: string;
  identityEntityId?: string;
  assetId?: string;
  contextSnapshotId: string;
  contextHealth: ContextHealth;
}

/**
 * The `event.normalized.v1` Kafka payload contract, published by
 * shield-ingest's normalization.service.ts. shield-core consumes this
 * directly and never queries shield-ingest-owned tables (`RawEvent`,
 * `NormalizedEvent`, `ConnectorInstance`, `ConnectorHealthStatus`) —
 * everything needed to resolve context and evaluate detections travels in
 * this payload, including source health, so a degraded connector's
 * incompleteness is visible without a cross-domain table read.
 */
export interface NormalizedEventContract {
  tenantId: string;
  environmentId: string;
  region: string;
  normalizedEventId: string;
  connectorId: string;
  sourceSystem: string;
  eventClass: string;
  eventCategory?: string;
  eventActivity?: string;
  actorUserId?: string;
  actorEmail?: string;
  sourceIp?: string;
  destinationIp?: string;
  resourceId?: string;
  resourceType?: string;
  action?: string;
  outcome?: string;
  occurredAt: string;
  schemaVersion: string;
  normalizerVersion: string;
  correlationId: string;
  traceId: string;
  /** Connector health as shield-ingest saw it at normalization time — 'HEALTHY'/'CONNECTED'/'SYNCING' or a degraded state name, computed and owned entirely by shield-ingest. */
  sourceHealthState: string;
}
