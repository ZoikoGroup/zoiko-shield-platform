import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type CedarEffect = 'permit' | 'forbid';

export interface CedarPolicyStatement {
  policyId: string;
  effect: CedarEffect;
  principal: string; // e.g. "Role::\"SecOpsAnalyst\"" or "*"
  action: string; // e.g. "Action::\"ISOLATE_ENDPOINT\"" or "*"
  resource: string; // e.g. "Host::\"*\"" or "*"
  conditions?: {
    when?: Record<string, any>;
    unless?: Record<string, any>;
  };
  description?: string;
}

export interface CedarEvaluationContext {
  principal: string;
  action: string;
  resource: string;
  context: {
    tenantId: string;
    environmentId?: string;
    authorityLevel?: 'R0' | 'R1' | 'R2' | 'R3' | 'R4';
    approverCount?: number;
    threatSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    isSimulation?: boolean;
    [key: string]: any;
  };
}

export interface CedarEvaluationDecision {
  decision: 'ALLOW' | 'DENY';
  reason: string;
  matchedPolicies: string[];
  evaluationTimestamp: string;
  evaluationDigest: string;
}

@Injectable()
export class CedarPolicyEvaluatorService {
  private readonly logger = new Logger(CedarPolicyEvaluatorService.name);
  private policies: Map<string, CedarPolicyStatement> = new Map();

  constructor() {
    this.seedDefaultPolicies();
  }

  private seedDefaultPolicies() {
    const defaultPolicies: CedarPolicyStatement[] = [
      {
        policyId: 'cedar-pol-001',
        effect: 'forbid',
        principal: '*',
        action: 'Action::"TERMINATE_CLOUD_INSTANCE"',
        resource: '*',
        conditions: {
          unless: { 'context.approverCount': { gte: 2 } },
        },
        description:
          'Forbid critical cloud termination without dual-key authorization (R4 quorum)',
      },
      {
        policyId: 'cedar-pol-002',
        effect: 'permit',
        principal: 'Role::"SecOpsAnalyst"',
        action: 'Action::"ISOLATE_ENDPOINT"',
        resource: '*',
        conditions: {
          when: { 'context.threatSeverity': { in: ['CRITICAL', 'HIGH'] } },
        },
        description:
          'Permit endpoint quarantine by SecOps on Critical/High threats',
      },
      {
        policyId: 'cedar-pol-003',
        effect: 'permit',
        principal: 'Role::"SecOpsAnalyst"',
        action: 'Action::"DISABLE_USER_ACCOUNT"',
        resource: '*',
        conditions: {
          when: { 'context.approverCount': { gte: 1 } },
        },
        description:
          'Permit identity suspension with at least 1 human approval',
      },
      {
        policyId: 'cedar-pol-004',
        effect: 'permit',
        principal: '*',
        action: '*',
        resource: '*',
        conditions: {
          when: { 'context.isSimulation': true },
        },
        description: 'Permit all actions in simulation mode (R0)',
      },
    ];

    for (const pol of defaultPolicies) {
      this.policies.set(pol.policyId, pol);
    }
  }

  registerPolicy(policy: CedarPolicyStatement): void {
    this.policies.set(policy.policyId, policy);
    this.logger.log(
      `Registered Cedar Policy '${policy.policyId}': ${policy.description}`,
    );
  }

  getPolicies(): CedarPolicyStatement[] {
    return Array.from(this.policies.values());
  }

  /**
   * Evaluates request against registered Cedar policies using Standard Cedar Semantics:
   * 1. Default is DENY.
   * 2. Any matching FORBID immediately DENIES (forbid overrides permit).
   * 3. At least one matching PERMIT is required to ALLOW.
   */
  evaluate(input: CedarEvaluationContext): CedarEvaluationDecision {
    const matchedPermits: string[] = [];
    const matchedForbids: string[] = [];

    for (const policy of this.policies.values()) {
      if (!this.matchesPattern(policy.principal, input.principal)) continue;
      if (!this.matchesPattern(policy.action, input.action)) continue;
      if (!this.matchesPattern(policy.resource, input.resource)) continue;

      if (!this.evalConditions(policy.conditions, input.context)) continue;

      if (policy.effect === 'forbid') {
        matchedForbids.push(policy.policyId);
      } else if (policy.effect === 'permit') {
        matchedPermits.push(policy.policyId);
      }
    }

    let decision: 'ALLOW' | 'DENY' = 'DENY';
    let reason = 'Explicit default deny: No permit policy satisfied';

    if (matchedForbids.length > 0) {
      decision = 'DENY';
      reason = `Explicit forbid policy triggered: [${matchedForbids.join(', ')}] overrides all permits`;
    } else if (matchedPermits.length > 0) {
      decision = 'ALLOW';
      reason = `Permitted by policy: [${matchedPermits.join(', ')}]`;
    }

    const evaluationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          input,
          decision,
          reason,
          matchedPermits,
          matchedForbids,
        }),
      )
      .digest('hex');

    return {
      decision,
      reason,
      matchedPolicies:
        decision === 'ALLOW'
          ? matchedPermits
          : matchedForbids.length
            ? matchedForbids
            : [],
      evaluationTimestamp: new Date().toISOString(),
      evaluationDigest,
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
    const parts = path.replace(/^context\./, '').split('.');
    let curr = ctx;
    for (const p of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[p];
    }
    return curr;
  }

  private evaluatePredicate(actual: any, expected: any): boolean {
    if (
      typeof expected === 'object' &&
      expected !== null &&
      !Array.isArray(expected)
    ) {
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
    }
    return actual === expected;
  }
}
