import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface SlaWindowMetric {
  tenantId: string;
  billingPeriodMonth: string; // e.g. "2026-08"
  measuredUptimePercent: number; // e.g. 99.85
  p1IncidentCount: number;
  averageP1MttrMinutes: number; // e.g. 24
  monthlyContractValueUsd: number; // e.g. 50000
  sensorTimestamp?: string | Date;
  isSensorStale?: boolean;
}

export interface SlaCreditSettlementResult {
  settlementId: string;
  tenantId: string;
  billingPeriodMonth: string;
  isBreached: boolean;
  breachReasons: string[];
  creditPercentage: number; // 0 to 50%
  creditAmountUsd: number;
  invoiceAdjustmentStatus:
    | 'NO_CREDIT_DUE'
    | 'CANDIDATE_CREDIT_EVENT_LOGGED'
    | 'STALE_SENSOR_HELD_FOR_REVIEW';
  requiresPolicyAuthorityApproval: boolean;
  autoNettingForbidden: boolean;
  settlementDigest: string;
  settledAt: string;
}

@Injectable()
export class AutomatedSlaCreditSettlementService {
  private readonly logger = new Logger(
    AutomatedSlaCreditSettlementService.name,
  );

  /**
   * Evaluates SLA commitments and emits a candidate credit event.
   *
   * Per Master Commercial Estate v2.0 Section 11 and P0-20:
   * - Credits are a contract remedy, not an admission of guaranteed security outcomes.
   * - An SLA breach generates a candidate credit event; issuance requires independent
   *   service validation and policy authority.
   * - Stale SLA sensors CANNOT issue automatic credits (P0-20).
   * - Auto-netting against open invoices without approved credit note and tax treatment is forbidden.
   */
  evaluateAndSettleSlaCredits(
    metric: SlaWindowMetric,
  ): SlaCreditSettlementResult {
    const breachReasons: string[] = [];
    let creditPercentage = 0;

    // Check P0-20: Stale SLA sensor protection
    const isStale =
      metric.isSensorStale ||
      (metric.sensorTimestamp &&
        Date.now() - new Date(metric.sensorTimestamp).getTime() >
          24 * 60 * 60 * 1000);

    // 1. Availability SLA Evaluation (Target: 99.99%)
    if (metric.measuredUptimePercent < 95.0) {
      creditPercentage = Math.max(creditPercentage, 50);
      breachReasons.push(
        `Major Availability Outage: Measured uptime ${metric.measuredUptimePercent}% (< 95.0%) -> 50% Credit Candidate`,
      );
    } else if (metric.measuredUptimePercent < 99.0) {
      creditPercentage = Math.max(creditPercentage, 25);
      breachReasons.push(
        `Availability Degradation: Measured uptime ${metric.measuredUptimePercent}% (< 99.0%) -> 25% Credit Candidate`,
      );
    } else if (metric.measuredUptimePercent < 99.99) {
      creditPercentage = Math.max(creditPercentage, 10);
      breachReasons.push(
        `Availability Target Missed: Measured uptime ${metric.measuredUptimePercent}% (< 99.99%) -> 10% Credit Candidate`,
      );
    }

    // 2. Incident MTTR SLA Evaluation (Target: 15 minutes for P1 incidents)
    if (metric.p1IncidentCount > 0 && metric.averageP1MttrMinutes > 60) {
      creditPercentage = Math.max(creditPercentage, 30);
      breachReasons.push(
        `P1 MTTR Severe Breach: Avg response time was ${metric.averageP1MttrMinutes}m (Target: 15m) -> 30% Credit Candidate`,
      );
    } else if (metric.p1IncidentCount > 0 && metric.averageP1MttrMinutes > 15) {
      creditPercentage = Math.max(creditPercentage, 15);
      breachReasons.push(
        `P1 MTTR Target Missed: Avg response time was ${metric.averageP1MttrMinutes}m (Target: 15m) -> 15% Credit Candidate`,
      );
    }

    const isBreached = creditPercentage > 0;
    const creditAmountUsd =
      (metric.monthlyContractValueUsd * creditPercentage) / 100;
    const settlementId = `sla-cand-${crypto.randomUUID()}`;

    let invoiceAdjustmentStatus:
      | 'NO_CREDIT_DUE'
      | 'CANDIDATE_CREDIT_EVENT_LOGGED'
      | 'STALE_SENSOR_HELD_FOR_REVIEW';

    if (!isBreached) {
      invoiceAdjustmentStatus = 'NO_CREDIT_DUE';
    } else if (isStale) {
      invoiceAdjustmentStatus = 'STALE_SENSOR_HELD_FOR_REVIEW';
      breachReasons.push(
        'P0-20 ENFORCED: Stale SLA sensor cannot issue automatic credits. Held for manual SRE/Finance review.',
      );
    } else {
      invoiceAdjustmentStatus = 'CANDIDATE_CREDIT_EVENT_LOGGED';
    }

    const settlementDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          settlementId,
          metric,
          creditPercentage,
          creditAmountUsd,
          invoiceAdjustmentStatus,
        }),
      )
      .digest('hex');

    if (isBreached) {
      this.logger.warn(
        `🚨 [SLA CANDIDATE CREDIT LOGGED] Tenant ${metric.tenantId} candidate credit: $${creditAmountUsd} (${creditPercentage}% of $${metric.monthlyContractValueUsd}) - Status: ${invoiceAdjustmentStatus}`,
      );
    } else {
      this.logger.log(
        `✔ [SLA COMPLIANT] Tenant ${metric.tenantId} met all 99.99% availability and MTTR commitments`,
      );
    }

    return {
      settlementId,
      tenantId: metric.tenantId,
      billingPeriodMonth: metric.billingPeriodMonth,
      isBreached,
      breachReasons,
      creditPercentage,
      creditAmountUsd,
      invoiceAdjustmentStatus,
      requiresPolicyAuthorityApproval: isBreached,
      autoNettingForbidden: true,
      settlementDigest,
      settledAt: new Date().toISOString(),
    };
  }
}
