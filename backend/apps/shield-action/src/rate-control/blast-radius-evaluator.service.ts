import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type TargetCriticalityTier = 'TIER_0_CRITICAL' | 'TIER_1_PRODUCTION' | 'TIER_2_STANDARD';

export interface TargetCriticalityRule {
  targetPattern: string; // regex string
  tier: TargetCriticalityTier;
  description: string;
}

export interface BlastRadiusEvaluationInput {
  tenantId: string;
  actionType: string;
  targetResource: string;
  targetClass?: string;
  totalFleetAssetsCount?: number;
  activeConcurrentActionsCount?: number;
  requestorId: string;
  isDualCustodyApproved?: boolean;
}

export interface BlastRadiusEvaluationResult {
  allowed: boolean;
  tier: TargetCriticalityTier;
  blastRadiusScore: number; // 0.0 (safest) to 1.0 (most hazardous)
  fleetPercentageImpact: number;
  activeConcurrentActions: number;
  maxConcurrentAllowed: number;
  requiresDualStepup: boolean;
  reason?: string;
  evaluationTimestamp: string;
  cryptographicAssessmentDigest: string;
}

const DEFAULT_CRITICALITY_RULES: TargetCriticalityRule[] = [
  // Tier 0 Critical Targets (Strictly Forbidden for automated containment without dual custody)
  {
    targetPattern: '.*(domain-controller|ad-root|idp-root|okta-master|keyvault|hsm-module|db-master|prod-k8s-control-plane).*',
    tier: 'TIER_0_CRITICAL',
    description: 'Tier-0 Identity, Cryptographic, or Core Infrastructure Root Asset',
  },
  {
    targetPattern: '.*(arn:aws:iam::.*:root|arn:aws:iam::.*:role/OrganizationAccountAccessRole).*',
    tier: 'TIER_0_CRITICAL',
    description: 'AWS Root Account or Organization Master Access Role',
  },
  // Tier 1 Production Targets (Strict fleet percentage and concurrency limits)
  {
    targetPattern: '.*(prod-|production-|prd-|live-db|api-gateway|prod-eks|prod-aks).*',
    tier: 'TIER_1_PRODUCTION',
    description: 'Production Tier Workload or Shared Application Infrastructure',
  },
  // Default fallback is Tier 2 Standard
];

@Injectable()
export class BlastRadiusEvaluatorService {
  private readonly logger = new Logger(BlastRadiusEvaluatorService.name);
  private customRules: Map<string, TargetCriticalityRule[]> = new Map();

  /**
   * Classifies a target resource into its governing criticality tier.
   */
  classifyTarget(targetResource: string, tenantId?: string): { tier: TargetCriticalityTier; matchedRule: string } {
    const tenantRules = (tenantId && this.customRules.get(tenantId)) || [];
    const allRules = [...tenantRules, ...DEFAULT_CRITICALITY_RULES];

    const normalizedTarget = targetResource.toLowerCase();

    for (const rule of allRules) {
      const regex = new RegExp(rule.targetPattern, 'i');
      if (regex.test(normalizedTarget)) {
        return { tier: rule.tier, matchedRule: rule.description };
      }
    }

    return {
      tier: 'TIER_2_STANDARD',
      matchedRule: 'Standard Fleet Endpoint or Non-Critical Development Workload',
    };
  }

  /**
   * Evaluates blast radius safety invariants under ZS-ENG-DRS-001 §19.
   */
  evaluateBlastRadius(input: BlastRadiusEvaluationInput): BlastRadiusEvaluationResult {
    const timestamp = new Date().toISOString();
    const { tier, matchedRule } = this.classifyTarget(input.targetResource, input.tenantId);

    const totalFleet = Math.max(input.totalFleetAssetsCount ?? 100, 1);
    const concurrentActions = input.activeConcurrentActionsCount ?? 0;
    const fleetPercentageImpact = Number(((1 / totalFleet) * 100).toFixed(2));

    let blastRadiusScore = 0.1;
    let maxConcurrentAllowed = 10;
    let requiresDualStepup = false;
    let allowed = true;
    let reason: string | undefined;

    switch (tier) {
      case 'TIER_0_CRITICAL':
        blastRadiusScore = 0.95;
        maxConcurrentAllowed = 0;
        requiresDualStepup = true;

        if (!input.isDualCustodyApproved) {
          allowed = false;
          reason = `BLAST_RADIUS_VIOLATION: Automated action on Tier-0 Critical Asset '${input.targetResource}' is blocked. Dual-custody approval (ZS-ENG-DRS-001 §19.2) required. Matched: ${matchedRule}`;
        } else {
          reason = `TIER_0_STEPPED_UP: Target is Tier-0 Critical, but dual-custody authorization has been verified.`;
        }
        break;

      case 'TIER_1_PRODUCTION':
        blastRadiusScore = 0.65;
        maxConcurrentAllowed = 2; // Spec §19.2: Max 2 concurrent unverified containment actions in production
        const maxFleetPercentageCeiling = 10.0; // Max 10% of fleet

        if (concurrentActions >= maxConcurrentAllowed && !input.isDualCustodyApproved) {
          allowed = false;
          reason = `BLAST_RADIUS_CONCURRENCY_EXCEEDED: ${concurrentActions} concurrent actions already active in production (max ${maxConcurrentAllowed} allowed). Matched: ${matchedRule}`;
        } else if (fleetPercentageImpact > maxFleetPercentageCeiling && !input.isDualCustodyApproved) {
          allowed = false;
          reason = `BLAST_RADIUS_FLEET_CEILING_EXCEEDED: Fleet impact ${fleetPercentageImpact}% exceeds maximum ${maxFleetPercentageCeiling}%.`;
        } else {
          reason = `TIER_1_APPROVED: Production blast radius within safety bounds (concurrency ${concurrentActions}/${maxConcurrentAllowed}, fleet ${fleetPercentageImpact}%).`;
        }
        break;

      case 'TIER_2_STANDARD':
      default:
        blastRadiusScore = 0.25;
        maxConcurrentAllowed = 10;

        if (concurrentActions >= maxConcurrentAllowed) {
          allowed = false;
          reason = `STANDARD_CONCURRENCY_LIMIT_EXCEEDED: Exceeded standard rate ceiling of ${maxConcurrentAllowed} concurrent actions.`;
        } else {
          reason = `TIER_2_APPROVED: Standard endpoint action safely within rate bounds.`;
        }
        break;
    }

    const assessmentDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          tenantId: input.tenantId,
          actionType: input.actionType,
          targetResource: input.targetResource,
          tier,
          blastRadiusScore,
          allowed,
          timestamp,
        }),
      )
      .digest('hex');

    if (!allowed) {
      this.logger.warn(
        `🚨 [BLAST RADIUS BLOCKED] Tenant: ${input.tenantId} | Action: ${input.actionType} on ${input.targetResource} (${tier}) | Reason: ${reason}`,
      );
    }

    return {
      allowed,
      tier,
      blastRadiusScore,
      fleetPercentageImpact,
      activeConcurrentActions: concurrentActions,
      maxConcurrentAllowed,
      requiresDualStepup,
      reason,
      evaluationTimestamp: timestamp,
      cryptographicAssessmentDigest: assessmentDigest,
    };
  }

  /**
   * Registers custom tenant-specific criticality override rules.
   */
  registerTenantRule(tenantId: string, rule: TargetCriticalityRule): void {
    const existing = this.customRules.get(tenantId) || [];
    this.customRules.set(tenantId, [rule, ...existing]);
  }
}
