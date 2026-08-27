import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface SlaWindowMetric {
  tenantId: string;
  billingPeriodMonth: string; // e.g. "2026-08"
  measuredUptimePercent: number; // e.g. 99.85
  p1IncidentCount: number;
  averageP1MttrMinutes: number; // e.g. 24
  monthlyContractValueUsd: number; // e.g. 50000
}

export interface SlaCreditSettlementResult {
  settlementId: string;
  tenantId: string;
  billingPeriodMonth: string;
  isBreached: boolean;
  breachReasons: string[];
  creditPercentage: number; // 0 to 50%
  creditAmountUsd: number;
  invoiceAdjustmentStatus: 'NO_CREDIT_DUE' | 'CREDIT_ISSUED_AUTOMATICALLY';
  settlementDigest: string;
  settledAt: string;
}

@Injectable()
export class AutomatedSlaCreditSettlementService {
  private readonly logger = new Logger(AutomatedSlaCreditSettlementService.name);

  /**
   * Evaluates SLA commitments and calculates automated service credits.
   */
  evaluateAndSettleSlaCredits(
    metric: SlaWindowMetric,
  ): SlaCreditSettlementResult {
    const breachReasons: string[] = [];
    let creditPercentage = 0;

    // 1. Availability SLA Evaluation (Target: 99.99%)
    if (metric.measuredUptimePercent < 95.0) {
      creditPercentage = Math.max(creditPercentage, 50);
      breachReasons.push(`Major Availability Outage: Measured uptime ${metric.measuredUptimePercent}% (< 95.0%) -> 50% Credit`);
    } else if (metric.measuredUptimePercent < 99.0) {
      creditPercentage = Math.max(creditPercentage, 25);
      breachReasons.push(`Availability Degradation: Measured uptime ${metric.measuredUptimePercent}% (< 99.0%) -> 25% Credit`);
    } else if (metric.measuredUptimePercent < 99.99) {
      creditPercentage = Math.max(creditPercentage, 10);
      breachReasons.push(`Availability Target Missed: Measured uptime ${metric.measuredUptimePercent}% (< 99.99%) -> 10% Credit`);
    }

    // 2. Incident MTTR SLA Evaluation (Target: 15 minutes for P1 incidents)
    if (metric.p1IncidentCount > 0 && metric.averageP1MttrMinutes > 60) {
      creditPercentage = Math.max(creditPercentage, 30);
      breachReasons.push(`P1 MTTR Severe Breach: Avg response time was ${metric.averageP1MttrMinutes}m (Target: 15m) -> 30% Credit`);
    } else if (metric.p1IncidentCount > 0 && metric.averageP1MttrMinutes > 15) {
      creditPercentage = Math.max(creditPercentage, 15);
      breachReasons.push(`P1 MTTR Target Missed: Avg response time was ${metric.averageP1MttrMinutes}m (Target: 15m) -> 15% Credit`);
    }

    const isBreached = creditPercentage > 0;
    const creditAmountUsd = (metric.monthlyContractValueUsd * creditPercentage) / 100;
    const settlementId = `sla-set-${crypto.randomUUID()}`;

    const settlementDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ settlementId, metric, creditPercentage, creditAmountUsd }))
      .digest('hex');

    if (isBreached) {
      this.logger.warn(
        `🚨 [SLA BREACH DETECTED] Tenant ${metric.tenantId} credit due: $${creditAmountUsd} (${creditPercentage}% of $${metric.monthlyContractValueUsd})`,
      );
    } else {
      this.logger.log(`✔ [SLA COMPLIANT] Tenant ${metric.tenantId} met all 99.99% availability and MTTR commitments`);
    }

    return {
      settlementId,
      tenantId: metric.tenantId,
      billingPeriodMonth: metric.billingPeriodMonth,
      isBreached,
      breachReasons,
      creditPercentage,
      creditAmountUsd,
      invoiceAdjustmentStatus: isBreached ? 'CREDIT_ISSUED_AUTOMATICALLY' : 'NO_CREDIT_DUE',
      settlementDigest,
      settledAt: new Date().toISOString(),
    };
  }
}
