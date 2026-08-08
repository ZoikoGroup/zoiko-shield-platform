export type IdentityType =
  | 'HUMAN'
  | 'SERVICE_ACCOUNT'
  | 'WORKLOAD'
  | 'APPLICATION'
  | 'MANAGED_IDENTITY'
  | 'UNKNOWN';

export type ResolutionDecisionType = 'MATCHED' | 'CREATED' | 'AMBIGUOUS' | 'UNRESOLVED' | 'REJECTED';

export interface ResolveIdentityInput {
  tenantId: string;
  environmentId?: string;
  /** The system that observed this identity, e.g. 'microsoft-entra'. Part of the alias uniqueness key — never used as the canonical primary key itself. */
  sourceSystem: string;
  /** Scopes the alias to a specific connector instance when the same sourceSystem can appear multiple times per tenant (e.g. two Entra tenants). */
  sourceAccountId?: string;
  /** e.g. 'OBJECT_ID', 'EMAIL', 'UPN' */
  externalType: string;
  externalId: string;
  email?: string;
  displayName?: string;
  identityType?: IdentityType;
  observedAt?: Date;
}

export interface ResolvedIdentity {
  identityEntityId: string;
  decision: ResolutionDecisionType;
}
