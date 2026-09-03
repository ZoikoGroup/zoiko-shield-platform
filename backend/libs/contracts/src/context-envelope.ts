/**
 * ZoikoShield Canonical Context Envelope Contract
 * Governed by ZS-ENG-INT-001 §06 & ZS-ENG-DATA-001 §09
 * Mandatory context required across every trust boundary, request, and storage interaction.
 */

export type DataClassification =
  | 'DC-0_PUBLIC'
  | 'DC-1_INTERNAL'
  | 'DC-2_CONFIDENTIAL'
  | 'DC-3_PERSONAL'
  | 'DC-4_SENSITIVE_SECURITY'
  | 'DC-5_EVIDENCE_LEGAL'
  | 'DC-6_SECRET_MATERIAL';

export type IntegrityState = 'VERIFIED' | 'UNVERIFIED' | 'TAMPERED' | 'QUARANTINED';

export interface CanonicalContextEnvelope {
  tenant_id: string;
  environment_id: string;
  region: string;
  legal_entity_id?: string;
  data_class: DataClassification | string;
  purpose: string;
  actor_id: string;
  workload_id?: string;
  authorization_decision_id?: string;
  trace_id: string;
  correlation_id: string;
  causation_id?: string;
  request_id?: string;
  idempotency_key?: string;
  policy_version: string;
  contract_id: string;
  contract_version: string;
  occurred_at: string;
  observed_at: string;
  recorded_at: string;
  schema_or_contract_version?: string;
  integrity_state?: IntegrityState;
}

export function createCanonicalContext(
  params: Partial<CanonicalContextEnvelope> & {
    tenant_id: string;
    environment_id: string;
    region: string;
    actor_id: string;
    purpose: string;
    policy_version: string;
    contract_id: string;
    contract_version: string;
  },
): CanonicalContextEnvelope {
  const now = new Date().toISOString();
  return {
    tenant_id: params.tenant_id,
    environment_id: params.environment_id,
    region: params.region,
    legal_entity_id: params.legal_entity_id,
    data_class: params.data_class || 'DC-2_CONFIDENTIAL',
    purpose: params.purpose,
    actor_id: params.actor_id,
    workload_id: params.workload_id,
    authorization_decision_id: params.authorization_decision_id,
    trace_id: params.trace_id || `trc-${crypto.randomUUID()}`,
    correlation_id: params.correlation_id || `cor-${crypto.randomUUID()}`,
    causation_id: params.causation_id,
    request_id: params.request_id || `req-${crypto.randomUUID()}`,
    idempotency_key: params.idempotency_key,
    policy_version: params.policy_version,
    contract_id: params.contract_id,
    contract_version: params.contract_version,
    occurred_at: params.occurred_at || now,
    observed_at: params.observed_at || now,
    recorded_at: params.recorded_at || now,
    schema_or_contract_version: params.schema_or_contract_version || params.contract_version,
    integrity_state: params.integrity_state || 'VERIFIED',
  };
}
