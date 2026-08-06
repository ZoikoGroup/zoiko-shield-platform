export interface CanonicalContext {
  tenantId: string;
  legalEntityId: string;
  environmentId: string;
  region: string;

  actorId?: string;
  workloadId?: string;

  correlationId: string;
  causationId?: string;
  traceId: string;
  requestId: string;
  idempotencyKey?: string;

  purpose: string;
  dataClass: string;
  policyVersion: string;

  contractId: string;
  contractVersion: string;

  occurredAt?: string;
  observedAt?: string;
  recordedAt: string;
}
