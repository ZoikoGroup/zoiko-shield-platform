/**
 * ZoikoShield Canonical Event Contract
 * Governed by ZS-ENG-INT-001 §07 & ZS-T0-TECH-001 §06
 * Standard event schema for telemetry ingestion, Kafka event backbone, and OCSF normalization.
 */

export interface CanonicalEventProducer {
  service: string;
  version: string;
  identity: string;
}

export interface CanonicalEventSource {
  connector_id: string;
  native_ref?: string;
  mapping_version?: string;
}

export interface CanonicalEventIntegrity {
  hash: string;
  signature_ref?: string;
  state: 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'QUARANTINED';
}

export interface CanonicalEvent<T = Record<string, unknown>> {
  event_id: string;
  contract_id: string;
  contract_version: string;
  tenant_id: string;
  environment_id?: string;
  region: string;
  event_type: string;
  occurred_at: string;
  observed_at: string;
  recorded_at: string;
  producer: CanonicalEventProducer;
  correlation_id: string;
  causation_id?: string;
  ordering_key?: string;
  source: CanonicalEventSource;
  integrity: CanonicalEventIntegrity;
  data: T;
}

export function buildCanonicalEvent<T = Record<string, unknown>>(
  params: Omit<CanonicalEvent<T>, 'event_id' | 'recorded_at'> & {
    event_id?: string;
    recorded_at?: string;
  },
): CanonicalEvent<T> {
  const now = new Date().toISOString();
  return {
    event_id: params.event_id || `evt-${crypto.randomUUID()}`,
    contract_id: params.contract_id,
    contract_version: params.contract_version,
    tenant_id: params.tenant_id,
    environment_id: params.environment_id,
    region: params.region,
    event_type: params.event_type,
    occurred_at: params.occurred_at,
    observed_at: params.observed_at,
    recorded_at: params.recorded_at || now,
    producer: params.producer,
    correlation_id: params.correlation_id,
    causation_id: params.causation_id,
    ordering_key: params.ordering_key,
    source: params.source,
    integrity: params.integrity,
    data: params.data,
  };
}
