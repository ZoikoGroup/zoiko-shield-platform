import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type CedarEffect = 'permit' | 'forbid';

export interface CedarPolicyStatement {
  policyId: string;
  effect: CedarEffect;
  principal: string; // e.g. "Role::\"SecOpsAnalyst\"", "Principal::\"ai-agent\"", "*"
  action: string; // e.g. "Action::\"case.read\"", "Action::\"case.write\"", "*"
  resource: string; // e.g. "Resource::\"Case\"", "*"
  conditions?: {
    when?: Record<string, any>;
    unless?: Record<string, any>;
  };
  description?: string;
  version?: string;
}

export interface CedarEvaluationContext {
  principal: string;
  action: string;
  resource: string;
  context: {
    tenantId: string;
    resourceTenantId?: string;
    legalEntityId?: string;
    resourceLegalEntityId?: string;
    environmentId?: string;
    purpose?: string;
    actorType?: 'HUMAN' | 'AI_AGENT' | 'WORKLOAD' | 'SUPPORT_OPERATOR';
    isSupportUser?: boolean;
    hasCustomerApproval?: boolean;
    approverCount?: number;
    approvalExpired?: boolean;
    threatSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    riskState?: string;
    isSimulation?: boolean;
    policyVersion?: string;
    [key: string]: any;
  };
}

export interface CedarEvaluationDecision {
  decision: 'ALLOW' | 'DENY' | 'INDETERMINATE';
  reasonCode: string;
  reason: string;
  matchedPolicies: string[];
  evaluationTimestamp: string;
  evaluationDigest: string;
  obligations: string[];
}

@Injectable()
export class CedarPolicyEvaluatorService {
  private readonly logger = new Logger(CedarPolicyEvaluatorService.name);
  private policies: Map<string, CedarPolicyStatement> = new Map();
  private policyBundleVersion = '2026.09.01';
  private isAvailable = true;

  constructor() {
    this.seedCanonicalPolicies();
  }

  setAvailable(available: boolean): void {
    this.isAvailable = available;
  }

  getPolicyBundleVersion(): string {
    return this.policyBundleVersion;
  }

  private seedCanonicalPolicies() {
    const canonicalPolicies: CedarPolicyStatement[] = [
      // 1. LAB 12 Rule: Forbid AI agents from direct resource modification/execution
      {
        policyId: 'cedar-core-forbid-ai-direct-access',
        effect: 'forbid',
        principal: 'Principal::"ai-agent"',
        action: '*',
        resource: '*',
        conditions: {
          unless: { 'context.isSimulation': true },
        },
        description: 'Forbid AI agents from direct authoritative resource access or mutation (TUT-03)',
      },
      // 2. LAB 12 Rule: Forbid cross-tenant access unconditionally
      {
        policyId: 'cedar-core-forbid-cross-tenant',
        effect: 'forbid',
        principal: '*',
        action: '*',
        resource: '*',
        conditions: {
          when: { 'context.isCrossTenant': true },
        },
        description: 'Unconditionally forbid any cross-tenant resource access',
      },
      // 2b. LAB 12 Rule: Forbid cross-legal-entity access when mismatched
      {
        policyId: 'cedar-core-forbid-mismatched-legal-entity',
        effect: 'forbid',
        principal: '*',
        action: '*',
        resource: '*',
        conditions: {
          when: { 'context.isLegalEntityMismatch': true },
        },
        description: 'Forbid cross-legal-entity resource access without explicit cross-entity delegation',
      },
      // 3. LAB 12 Rule: Forbid support user access without customer approval
      {
        policyId: 'cedar-core-forbid-support-without-approval',
        effect: 'forbid',
        principal: 'Principal::"support-operator"',
        action: '*',
        resource: '*',
        conditions: {
          unless: { 'context.hasCustomerApproval': true },
        },
        description: 'Forbid support operator access without explicit customer-approved JIT grant (Section 6)',
      },
      // 4. LAB 12 Rule: Forbid operations with stale/expired approvals
      {
        policyId: 'cedar-core-forbid-stale-approval',
        effect: 'forbid',
        principal: '*',
        action: '*',
        resource: '*',
        conditions: {
          when: { 'context.approvalExpired': true },
        },
        description: 'Forbid execution when approval or JIT delegation has expired',
      },
      // 5. Standard Permit: SOC Analysts reading and triaging cases in active investigation
      {
        policyId: 'cedar-core-permit-soc-analyst-case-read',
        effect: 'permit',
        principal: 'Group::"soc-analysts"',
        action: 'Action::"case.read"',
        resource: 'Resource::"Case"',
        conditions: {
          when: {
            'context.purpose': 'investigation',
          },
        },
        description: 'Permit SOC analysts to read cases under investigation purpose (LAB 12 example)',
      },
      // 6. Standard Permit: Tenant resource read/write when purpose is valid and tenant matches
      {
        policyId: 'cedar-core-permit-tenant-scoped-operations',
        effect: 'permit',
        principal: '*',
        action: '*',
        resource: '*',
        conditions: {
          when: {
            'context.isTenantAuthorized': true,
          },
        },
        description: 'Permit operations when tenant context is verified and active membership is confirmed',
      },
    ];

    for (const pol of canonicalPolicies) {
      this.policies.set(pol.policyId, pol);
    }
  }

  registerPolicy(policy: CedarPolicyStatement): void {
    this.policies.set(policy.policyId, policy);
    this.logger.log(`Registered Cedar Policy '${policy.policyId}': ${policy.description}`);
  }

  getPolicies(): CedarPolicyStatement[] {
    return Array.from(this.policies.values());
  }

  /**
   * Evaluates request against deterministic Cedar policy statements.
   * Standard Cedar Semantics:
   * 1. Default is DENY.
   * 2. Any matching FORBID immediately DENIES (forbid overrides permit).
   * 3. At least one matching PERMIT is required to ALLOW.
   * 4. If policy bundle is unavailable, returns fail-closed INDETERMINATE.
   */
  evaluate(input: CedarEvaluationContext): CedarEvaluationDecision {
    if (!this.isAvailable) {
      return {
        decision: 'INDETERMINATE',
        reasonCode: 'POLICY_DEPENDENCY_UNAVAILABLE',
        reason: 'The Cedar policy bundle engine is currently unavailable (fail-closed)',
        matchedPolicies: [],
        evaluationTimestamp: new Date().toISOString(),
        evaluationDigest: crypto.createHash('sha256').update(`UNAVAILABLE:${JSON.stringify(input)}`).digest('hex'),
        obligations: ['DENY_EXECUTION', 'RETRY_WITH_FRESH_CONTEXT'],
      };
    }

    // Dynamic context flags for Cedar evaluation
    const evalContext = {
      ...input.context,
      isCrossTenant:
        Boolean(input.context.resourceTenantId) &&
        input.context.resourceTenantId !== input.context.tenantId,
      isLegalEntityMismatch:
        Boolean(input.context.resourceLegalEntityId) &&
        Boolean(input.context.legalEntityId) &&
        input.context.resourceLegalEntityId !== input.context.legalEntityId,
    };

    const matchedPermits: string[] = [];
    const matchedForbids: string[] = [];

    for (const policy of this.policies.values()) {
      if (!this.matchesPattern(policy.principal, input.principal)) continue;
      if (!this.matchesPattern(policy.action, input.action)) continue;
      if (!this.matchesPattern(policy.resource, input.resource)) continue;

      if (!this.evalConditions(policy.conditions, evalContext)) continue;

      if (policy.effect === 'forbid') {
        matchedForbids.push(policy.policyId);
      } else if (policy.effect === 'permit') {
        matchedPermits.push(policy.policyId);
      }
    }

    let decision: 'ALLOW' | 'DENY' = 'DENY';
    let reasonCode = 'POLICY_DENY';
    let reason = 'Explicit default deny: No permit policy satisfied';
    const obligations: string[] = ['DENY_EXECUTION'];

    if (matchedForbids.length > 0) {
      decision = 'DENY';
      reasonCode = 'CEDAR_FORBID_TRIGGERED';
      reason = `Explicit forbid policy triggered: [${matchedForbids.join(', ')}] overrides all permits`;
    } else if (matchedPermits.length > 0) {
      decision = 'ALLOW';
      reasonCode = 'POLICY_PERMIT';
      reason = `Permitted by Cedar policy: [${matchedPermits.join(', ')}]`;
      obligations.length = 0;
      obligations.push('AUDIT_MATERIAL_ACTION');
    }

    const evaluationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          input,
          decision,
          reasonCode,
          matchedPermits,
          matchedForbids,
          bundleVersion: this.policyBundleVersion,
        }),
      )
      .digest('hex');

    return {
      decision,
      reasonCode,
      reason,
      matchedPolicies: decision === 'ALLOW' ? matchedPermits : matchedForbids,
      evaluationTimestamp: new Date().toISOString(),
      evaluationDigest,
      obligations,
    };
  }

  private matchesPattern(pattern: string, value: string): boolean {
    if (pattern === '*') return true;
    if (pattern === value) return true;
    return false;
  }

  private evalConditions(
    conditions?: CedarPolicyStatement['conditions'],
    ctx?: Record<string, any>,
  ): boolean {
    if (!conditions) return true;
    const context = ctx ?? {};

    if (conditions.when) {
      for (const [key, expected] of Object.entries(conditions.when)) {
        const val = this.resolveContextKey(key, context);
        if (!this.evaluatePredicate(val, expected)) return false;
      }
    }

    if (conditions.unless) {
      for (const [key, expected] of Object.entries(conditions.unless)) {
        const val = this.resolveContextKey(key, context);
        if (this.evaluatePredicate(val, expected)) return false;
      }
    }

    return true;
  }

  private resolveContextKey(path: string, ctx: Record<string, any>): any {
    const cleanPath = path.replace(/^context\./, '');
    const parts = cleanPath.split('.');
    let curr = ctx;
    for (const p of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[p];
    }
    return curr;
  }

  private evaluatePredicate(actual: any, expected: any): boolean {
    if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
      if ('gte' in expected && typeof actual === 'number') {
        return actual >= expected.gte;
      }
      if ('lte' in expected && typeof actual === 'number') {
        return actual <= expected.lte;
      }
      if ('in' in expected && Array.isArray(expected.in)) {
        return expected.in.includes(actual);
      }
      if ('equals' in expected) {
        return actual === expected.equals;
      }
      if ('notEquals' in expected) {
        return actual !== expected.notEquals;
      }
    }
    return actual === expected;
  }
}
