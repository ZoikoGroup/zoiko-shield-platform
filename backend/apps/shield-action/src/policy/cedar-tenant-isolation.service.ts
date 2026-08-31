import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type AuthorityLevel = 'R0_READ_ONLY' | 'R1_DIAGNOSTIC' | 'R2_GOVERNED_CONTAINMENT' | 'R3_PRIVILEGED_ELEVATION' | 'R4_EMERGENCY_FREEZE';

export interface CedarDecisionContext {
  principal: {
    id: string;
    type: 'HUMAN_USER' | 'WORKLOAD_SERVICE' | 'SUPPORT_DELEGATE' | 'AI_AGENT';
    tenantId: string;
    legalEntityId: string;
    roles: string[];
    sessionId: string;
  };
  resource: {
    id: string;
    type: string;
    tenantId: string;
    legalEntityId: string;
    environment: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
  };
  action: {
    name: string; // e.g. 'case.read', 'action.isolate_endpoint', 'action.emergency_freeze'
    authorityLevel: AuthorityLevel;
  };
  governance: {
    purpose: string; // e.g. 'incident_investigation', 'scheduled_maintenance'
    caseReference?: string;
    approvalRef?: string;
    isApprovalStale?: boolean;
    hasCustomerSupportGrant?: boolean;
    policyBundleVersion: string;
  };
}

export interface CedarAuthorizationResult {
  decisionId: string;
  decision: 'ALLOW' | 'DENY';
  reasonCode:
    | 'PERMITTED_BY_POLICY'
    | 'DENIED_CROSS_TENANT_ACCESS'
    | 'DENIED_WRONG_LEGAL_ENTITY'
    | 'DENIED_STALE_OR_EXPIRED_APPROVAL'
    | 'DENIED_MISSING_PURPOSE'
    | 'DENIED_REVOKED_OR_INSUFFICIENT_ROLE'
    | 'DENIED_POLICY_BUNDLE_UNAVAILABLE'
    | 'DENIED_SUPPORT_WITHOUT_CUSTOMER_JIT_GRANT'
    | 'DENIED_AI_AGENT_DIRECT_RESOURCE_ACCESS';
  evaluatedAt: string;
  policyBundleVersion: string;
  attestationDigest: string;
}

/**
 * Cedar Authorization & Tenant Isolation Policy Engine
 * Specification: Backend Build Guide §LAB 12 (Cedar Authorisation and Tenant Isolation)
 */
@Injectable()
export class CedarTenantIsolationService {
  private readonly logger = new Logger(CedarTenantIsolationService.name);

  /**
   * Deterministically evaluates Cedar authorization policies and executes tenant isolation checks.
   */
  evaluateAuthorization(context: CedarDecisionContext, isPolicyEngineAvailable = true): CedarAuthorizationResult {
    const decisionId = `authz-dec-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();

    // 1. Fail-closed: Policy Bundle Unavailable
    if (!isPolicyEngineAvailable || !context.governance.policyBundleVersion) {
      return this.buildResult(decisionId, 'DENY', 'DENIED_POLICY_BUNDLE_UNAVAILABLE', context, evaluatedAt);
    }

    // 2. Strict AI Boundary: AI Agent cannot directly access or execute privileged resources
    if (context.principal.type === 'AI_AGENT') {
      return this.buildResult(decisionId, 'DENY', 'DENIED_AI_AGENT_DIRECT_RESOURCE_ACCESS', context, evaluatedAt);
    }

    // 3. Strict Tenant Isolation (Cross-tenant access prohibited)
    if (context.principal.tenantId !== context.resource.tenantId) {
      return this.buildResult(decisionId, 'DENY', 'DENIED_CROSS_TENANT_ACCESS', context, evaluatedAt);
    }

    // 4. Legal Entity Boundary
    if (context.principal.legalEntityId !== context.resource.legalEntityId) {
      return this.buildResult(decisionId, 'DENY', 'DENIED_WRONG_LEGAL_ENTITY', context, evaluatedAt);
    }

    // 5. Missing Mandatory Purpose
    if (!context.governance.purpose || context.governance.purpose.trim() === '') {
      return this.buildResult(decisionId, 'DENY', 'DENIED_MISSING_PURPOSE', context, evaluatedAt);
    }

    // 6. Stale or Expired Approval on R2+ actions
    if (
      (context.action.authorityLevel === 'R2_GOVERNED_CONTAINMENT' ||
        context.action.authorityLevel === 'R3_PRIVILEGED_ELEVATION') &&
      (!context.governance.approvalRef || context.governance.isApprovalStale)
    ) {
      return this.buildResult(decisionId, 'DENY', 'DENIED_STALE_OR_EXPIRED_APPROVAL', context, evaluatedAt);
    }

    // 7. Support User Access requires Customer JIT Grant
    if (context.principal.type === 'SUPPORT_DELEGATE' && !context.governance.hasCustomerSupportGrant) {
      return this.buildResult(decisionId, 'DENY', 'DENIED_SUPPORT_WITHOUT_CUSTOMER_JIT_GRANT', context, evaluatedAt);
    }

    // 8. Role Entitlement Check
    const requiredRole = this.getRequiredRole(context.action.authorityLevel);
    if (!context.principal.roles.includes(requiredRole) && !context.principal.roles.includes('SUPER_ADMIN')) {
      return this.buildResult(decisionId, 'DENY', 'DENIED_REVOKED_OR_INSUFFICIENT_ROLE', context, evaluatedAt);
    }

    // Permit
    return this.buildResult(decisionId, 'ALLOW', 'PERMITTED_BY_POLICY', context, evaluatedAt);
  }

  private getRequiredRole(level: AuthorityLevel): string {
    switch (level) {
      case 'R0_READ_ONLY':
        return 'SOC_ANALYST';
      case 'R1_DIAGNOSTIC':
        return 'SOC_INVESTIGATOR';
      case 'R2_GOVERNED_CONTAINMENT':
        return 'SOC_LEAD';
      case 'R3_PRIVILEGED_ELEVATION':
      case 'R4_EMERGENCY_FREEZE':
        return 'SECURITY_DIRECTOR';
    }
  }

  private buildResult(
    decisionId: string,
    decision: 'ALLOW' | 'DENY',
    reasonCode: CedarAuthorizationResult['reasonCode'],
    context: CedarDecisionContext,
    evaluatedAt: string,
  ): CedarAuthorizationResult {
    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          decisionId,
          decision,
          reasonCode,
          principalId: context.principal.id,
          resourceId: context.resource.id,
          policyVersion: context.governance.policyBundleVersion,
          evaluatedAt,
        }),
      )
      .digest('hex');

    if (decision === 'DENY') {
      this.logger.warn(`🛑 [CEDAR AUTHZ DENIED] ${reasonCode} for Principal '${context.principal.id}' on Action '${context.action.name}'`);
    } else {
      this.logger.log(`✔ [CEDAR AUTHZ PERMITTED] Action '${context.action.name}' allowed for Principal '${context.principal.id}'`);
    }

    return {
      decisionId,
      decision,
      reasonCode,
      evaluatedAt,
      policyBundleVersion: context.governance.policyBundleVersion,
      attestationDigest,
    };
  }
}
