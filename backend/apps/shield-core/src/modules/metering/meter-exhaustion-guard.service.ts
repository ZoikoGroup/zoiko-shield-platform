import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type MeterExhaustionStatus =
  | 'NORMAL'
  | 'WARNING_75'
  | 'CRITICAL_90'
  | 'EXHAUSTED_GRACE_PERIOD'
  | 'EXHAUSTED_HARD_THROTTLE';

export interface PlanQuotaLimit {
  planTier: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'GOVERNMENT';
  monthlyIngestGbLimit: number;
  maxActiveEndpoints: number;
  gracePeriodHours: number;
}

export interface MeterAssessmentInput {
  tenantId: string;
  planTier: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'GOVERNMENT';
  currentIngestGb: number;
  activeEndpoints: number;
  exhaustionOverrunHours?: number;
}

export interface MeterExhaustionDecision {
  assessmentId: string;
  tenantId: string;
  planTier: string;
  status: MeterExhaustionStatus;
  capacityPercentage: number;
  isIngestPermitted: boolean;
  throttleAction:
    | 'NONE'
    | 'SOFT_ALERT'
    | 'ESCALATE_UPSELL'
    | 'RATE_LIMIT_50PCT'
    | 'HARD_BLOCK';
  reason: string;
  auditDigest: string;
  evaluatedAt: string;
}

@Injectable()
export class MeterExhaustionGuardService {
  private readonly logger = new Logger(MeterExhaustionGuardService.name);

  private readonly PLAN_QUOTAS: Record<string, PlanQuotaLimit> = {
    STARTER: {
      planTier: 'STARTER',
      monthlyIngestGbLimit: 100,
      maxActiveEndpoints: 50,
      gracePeriodHours: 24,
    },
    PROFESSIONAL: {
      planTier: 'PROFESSIONAL',
      monthlyIngestGbLimit: 1000,
      maxActiveEndpoints: 500,
      gracePeriodHours: 48,
    },
    ENTERPRISE: {
      planTier: 'ENTERPRISE',
      monthlyIngestGbLimit: 10000,
      maxActiveEndpoints: 5000,
      gracePeriodHours: 72,
    },
    GOVERNMENT: {
      planTier: 'GOVERNMENT',
      monthlyIngestGbLimit: 50000,
      maxActiveEndpoints: 25000,
      gracePeriodHours: 168,
    },
  };

  /**
   * Evaluates real-time quota consumption and determines throttle/enforcement state.
   */
  evaluateMeterExhaustion(
    input: MeterAssessmentInput,
  ): MeterExhaustionDecision {
    const quota =
      this.PLAN_QUOTAS[input.planTier] || this.PLAN_QUOTAS.PROFESSIONAL;
    const capacityPct = Math.round(
      (input.currentIngestGb / quota.monthlyIngestGbLimit) * 100,
    );

    let status: MeterExhaustionStatus = 'NORMAL';
    let isIngestPermitted = true;
    let throttleAction: MeterExhaustionDecision['throttleAction'] = 'NONE';
    let reason = `Normal capacity utilization (${capacityPct}% of ${quota.monthlyIngestGbLimit} GB)`;

    if (capacityPct >= 100) {
      const overrunHours = input.exhaustionOverrunHours ?? 0;
      if (overrunHours <= quota.gracePeriodHours) {
        status = 'EXHAUSTED_GRACE_PERIOD';
        isIngestPermitted = true;
        throttleAction = 'RATE_LIMIT_50PCT';
        reason = `Quota exhausted (100%+). Operating under ${quota.gracePeriodHours}-hour grace period (${overrunHours}h elapsed).`;
      } else {
        status = 'EXHAUSTED_HARD_THROTTLE';
        isIngestPermitted = false;
        throttleAction = 'HARD_BLOCK';
        reason = `Grace period expired (${overrunHours}h > ${quota.gracePeriodHours}h). Ingest hard blocked pending plan upgrade.`;
      }
    } else if (capacityPct >= 90) {
      status = 'CRITICAL_90';
      isIngestPermitted = true;
      throttleAction = 'ESCALATE_UPSELL';
      reason = `Critical consumption threshold reached (${capacityPct}%). Plan upgrade recommended.`;
    } else if (capacityPct >= 75) {
      status = 'WARNING_75';
      isIngestPermitted = true;
      throttleAction = 'SOFT_ALERT';
      reason = `Warning threshold reached (${capacityPct}%). FinOps alert triggered.`;
    }

    const assessmentId = `meter-eval-${crypto.randomUUID()}`;
    const auditDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ input, status, capacityPct, throttleAction }))
      .digest('hex');

    return {
      assessmentId,
      tenantId: input.tenantId,
      planTier: input.planTier,
      status,
      capacityPercentage: capacityPct,
      isIngestPermitted,
      throttleAction,
      reason,
      auditDigest,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
