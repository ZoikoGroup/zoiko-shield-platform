export interface ActionAuthorizationContext {
  tenantId: string;
  environmentId: string;
  proposalId: string;
  caseId?: string;
  alertId?: string;
  actionType: string;
  targetType: string;
  targetId: string;
  authorityLevel: string;
  proposalStatus: string;
  approval: {
    approvalId: string;
    decision: string;
    approverId: string;
    expiresAt: string;
  } | null;
  policyVersion: string;
  authorizationDecisionId: string;
  entitlementAllowed: boolean;
  targetState: unknown;
  connectorCapability?: string;
  proposalVersion: number;
  approvedMaterialHash: string | null;
  correlationId: string;
}
