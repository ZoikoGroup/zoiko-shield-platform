import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';

export type QuotaEnforcementStatus =
  | 'NORMAL'
  | 'SOFT_CAP_WARNING'
  | 'HARD_CAP_THROTTLED';

export interface TenantQuotaContract {
  tenantId: string;
  dailyIngestionLimitGb: number;
  maxMonitoredAssets: number;
  maxActiveConnectors: number;
  softCapThresholdPercent: number; // e.g. 100% [derived]
  hardCapThresholdPercent: number; // e.g. 125% [derived]
}

export interface QuotaEvaluationResult {
  tenantId: string;
  currentIngestionGb: number;
  limitGb: number;
  utilizationPercent: number;
  enforcementStatus: QuotaEnforcementStatus;
  meteringReceiptHash: string;
  timestamp: string;
}

/**
 * [derived] EntitlementEnforcementService
 * Evaluates tenant ingestion volumes against configured quota limits and generates tamper-evident metering receipts.
 */
@Injectable()
export class EntitlementEnforcementService {
  private readonly logger = new Logger(EntitlementEnforcementService.name);
  private readonly signingSecret =
    process.env.METERING_SECRET || 'zs-metering-hmac-secret-default-key-32b';

  // In-memory tenant usage ledger [derived]
  private readonly tenantUsageLedger = new Map<string, number>();

  /**
   * Records incremental ingestion volume for a tenant (in GB).
   */
  public recordIngestionVolume(tenantId: string, volumeGb: number): number {
    const current = this.tenantUsageLedger.get(tenantId) || 0;
    const updated = current + volumeGb;
    this.tenantUsageLedger.set(tenantId, updated);
    return updated;
  }

  /**
   * Resets daily ingestion counter (e.g. at UTC midnight).
   */
  public resetDailyCounter(tenantId: string): void {
    this.tenantUsageLedger.set(tenantId, 0);
  }

  /**
   * Evaluates quota status against contract rules [derived].
   */
  public evaluateQuota(
    contract: TenantQuotaContract,
  ): QuotaEvaluationResult {
    const currentGb = this.tenantUsageLedger.get(contract.tenantId) || 0;
    const utilizationPercent =
      contract.dailyIngestionLimitGb > 0
        ? Math.round((currentGb / contract.dailyIngestionLimitGb) * 100)
        : 0;

    let enforcementStatus: QuotaEnforcementStatus = 'NORMAL';

    if (utilizationPercent >= contract.hardCapThresholdPercent) {
      enforcementStatus = 'HARD_CAP_THROTTLED';
      this.logger.warn(
        `🛑 [HARD CAP REACHED] Tenant ${contract.tenantId} exceeded hard quota limit (${utilizationPercent}% of ${contract.dailyIngestionLimitGb}GB).`,
      );
    } else if (utilizationPercent >= contract.softCapThresholdPercent) {
      enforcementStatus = 'SOFT_CAP_WARNING';
      this.logger.warn(
        `⚠️ [SOFT CAP WARNING] Tenant ${contract.tenantId} exceeded soft quota threshold (${utilizationPercent}% of ${contract.dailyIngestionLimitGb}GB).`,
      );
    }

    const timestamp = new Date().toISOString();
    const receiptData = `${contract.tenantId}:${currentGb}:${contract.dailyIngestionLimitGb}:${enforcementStatus}:${timestamp}`;
    const meteringReceiptHash = createHmac('sha256', this.signingSecret)
      .update(receiptData)
      .digest('hex');

    return {
      tenantId: contract.tenantId,
      currentIngestionGb: currentGb,
      limitGb: contract.dailyIngestionLimitGb,
      utilizationPercent,
      enforcementStatus,
      meteringReceiptHash,
      timestamp,
    };
  }
}
