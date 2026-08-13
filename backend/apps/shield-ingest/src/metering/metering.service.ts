import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireEnvironmentId } from '../security/tenant-context';

export interface UsageObservationDto {
  tenantId: string;
  environmentId?: string;
  sourceType: string;
  rawEventId?: string;
  unit?: string;
  acceptedQuantity?: number;
  billableQuantity?: number;
  usageState?: 'OBSERVED' | 'ACCEPTED' | 'REJECTED' | 'DUPLICATE' | 'QUARANTINED' | 'PLATFORM_DERIVED' | 'BILLABLE' | 'NON_BILLABLE';
  billingClassification?: string;
}

export interface ResourceObservationDto {
  tenantId: string;
  environmentId?: string;
  canonicalResourceId: string;
  resourceType: string; // ENDPOINT, SERVER, USER, MAILBOX, CLOUD_ACCOUNT, APPLICATION
  sourceConnectorId: string;
}

@Injectable()
export class MeteringService {
  private readonly logger = new Logger(MeteringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates active commercial contract entitlement for tenant (Doctrine D1 & D4).
   */
  private async evaluateContractAuthorization(tenantId: string): Promise<boolean> {
    try {
      const now = new Date();
      const entitlement = await (this.prisma as any).entitlement?.findFirst({
        where: {
          tenant_id: tenantId,
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gte: now } }],
        },
      });
      if (entitlement) return true;

      const account = await (this.prisma as any).commercialAccount?.findFirst({
        where: {
          status: 'ACTIVE',
          entitlements: {
            some: {
              tenant_id: tenantId,
              status: 'ACTIVE',
            },
          },
        },
      });
      if (account) return true;

      const directAccount = await (this.prisma as any).commercialAccount?.findFirst({
        where: {
          id: tenantId,
          status: 'ACTIVE',
        },
      });
      return !!directAccount;
    } catch {
      return false;
    }
  }

  /**
   * Evaluates active meter definition (Doctrine D1 & D4).
   */
  private async evaluateMeterDefinition(sourceType: string) {
    try {
      const now = new Date();
      const definition = await (this.prisma as any).meterDefinition?.findFirst({
        where: {
          status: 'APPROVED',
          effective_from: { lte: now },
          AND: [
            { OR: [{ effective_to: null }, { effective_to: { gte: now } }] },
            {
              OR: [
                { meter_key: sourceType },
                { meter_key: 'COMMERCIAL_DIRECT' },
                { meter_key: 'WEBHOOK_INGEST' },
              ],
            },
          ],
        },
        orderBy: { version: 'desc' },
      });
      return definition;
    } catch {
      return null;
    }
  }

  /**
   * Records telemetry usage observations enforcing ZS-COM-BILL-001 data class rules.
   * Telemetry is ONLY billable if evaluated against an approved meter_definition + contract authorization.
   * Duplicate, rejected, quarantined, and platform-generated records are explicitly NON_BILLABLE.
   */
  async recordUsageObservation(dto: UsageObservationDto) {
    const environmentId = requireEnvironmentId(dto.environmentId);
    const acceptedQty = dto.acceptedQuantity !== undefined ? dto.acceptedQuantity : 1;

    let usageState = dto.usageState || 'ACCEPTED';
    let billableQty = dto.billableQuantity || 0;

    // Force NON_BILLABLE and billableQuantity = 0 for duplicate, rejected, quarantined, or platform-derived states
    if (['REJECTED', 'DUPLICATE', 'QUARANTINED', 'PLATFORM_DERIVED'].includes(usageState)) {
      usageState = 'NON_BILLABLE';
      billableQty = 0;
    } else {
      // Evaluate contract authorization and meter definition per Doctrine D1 & D4
      const hasActiveContract = await this.evaluateContractAuthorization(dto.tenantId);
      const activeMeterDef = await this.evaluateMeterDefinition(dto.sourceType);

      if (!hasActiveContract || !activeMeterDef || activeMeterDef.billable_policy === 'NEVER_BILLABLE') {
        usageState = 'NON_BILLABLE';
        billableQty = 0;
      } else {
        usageState = 'BILLABLE';
        billableQty = dto.billableQuantity !== undefined ? dto.billableQuantity : 1;
      }
    }

    return this.prisma.usageRecord.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: environmentId,
        meter_version: 'v1.0',
        source_type: dto.sourceType,
        raw_event_id: dto.rawEventId,
        unit: dto.unit || 'EVENTS',
        accepted_quantity: acceptedQty,
        billable_quantity: billableQty,
        usage_state: usageState,
        billing_classification: dto.billingClassification || 'COMMERCIAL_DIRECT',
      },
    });
  }

  /**
   * Observes a protected resource (Endpoint, Server, User, Cloud Account) for ZS-COM-BILL-001 Section 7.
   * Discovered resources enter 'DISCOVERED' coverage state and 'NON_BILLABLE' state until contract acceptance.
   */
  async observeProtectedResource(dto: ResourceObservationDto) {
    const environmentId = requireEnvironmentId(dto.environmentId);

    const existing = await this.prisma.resourceObservation.findFirst({
      where: {
        tenant_id: dto.tenantId,
        canonical_resource_id: dto.canonicalResourceId,
        resource_type: dto.resourceType,
      },
    });

    if (existing) {
      return this.prisma.resourceObservation.update({
        where: { id: existing.id },
        data: { last_seen_at: new Date() },
      });
    }

    this.logger.log(
      `Discovered new ${dto.resourceType} resource '${dto.canonicalResourceId}' for tenant ${dto.tenantId}`,
    );

    return this.prisma.resourceObservation.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: environmentId,
        canonical_resource_id: dto.canonicalResourceId,
        resource_type: dto.resourceType,
        source_connector_id: dto.sourceConnectorId,
        coverage_state: 'DISCOVERED',
        billable_state: 'NON_BILLABLE',
      },
    });
  }

  /**
   * Get telemetry usage summary, committed capacity, projected forecast, and warning thresholds for a tenant
   * (Enforces MET-03 and D4 standards).
   */
  async getUsageSummary(tenantId: string) {
    const records = await this.prisma.usageRecord.findMany({
      where: { tenant_id: tenantId },
      orderBy: { recorded_at: 'desc' },
      take: 500,
    });

    const acceptedTotal = records.reduce((acc, r) => acc + r.accepted_quantity, 0);
    const billableTotal = records.reduce((acc, r) => acc + r.billable_quantity, 0);
    const nonBillableCount = records.filter((r) => r.usage_state === 'NON_BILLABLE').length;

    // Fetch active entitlement / contract committed capacity & meter definition
    let committedQuantity = 100000;
    let overagePolicy = 'STANDARD_OVERAGE_RATE';
    let overageRate = 0.005;

    try {
      const activeMeterDef = await this.evaluateMeterDefinition('WEBHOOK_INGEST');
      if (activeMeterDef && activeMeterDef.included_quantity > 0) {
        committedQuantity = activeMeterDef.included_quantity;
      }
    } catch (err) {
      this.logger.warn(`Could not load meter definition for forecast: ${err}`);
    }

    // Calculate run-rate projected forecast based on active records timeline
    let projectedForecast = billableTotal;
    if (records.length > 1) {
      const oldestRecord = records[records.length - 1];
      const newestRecord = records[0];
      const timeSpanMs = newestRecord.recorded_at.getTime() - oldestRecord.recorded_at.getTime();
      const timeSpanHours = timeSpanMs / (1000 * 60 * 60);

      if (timeSpanHours > 0) {
        const hourlyRate = billableTotal / timeSpanHours;
        projectedForecast = Math.round(hourlyRate * 720);
      }
    }

    // Warning thresholds per MET-03 (80%, 90%, 100%)
    const utilizationPercentage = committedQuantity > 0 ? (billableTotal / committedQuantity) * 100 : 0;
    let thresholdStatus: 'NORMAL' | 'WARNING_80' | 'WARNING_90' | 'EXCEEDED_100' = 'NORMAL';
    if (utilizationPercentage >= 100) {
      thresholdStatus = 'EXCEEDED_100';
    } else if (utilizationPercentage >= 90) {
      thresholdStatus = 'WARNING_90';
    } else if (utilizationPercentage >= 80) {
      thresholdStatus = 'WARNING_80';
    }

    const warningThresholds = {
      capacity80: Math.round(committedQuantity * 0.8),
      capacity90: Math.round(committedQuantity * 0.9),
      capacity100: committedQuantity,
      utilizationPercentage: Number(utilizationPercentage.toFixed(2)),
      status: thresholdStatus,
    };

    const overageRatePolicy = {
      policy: overagePolicy,
      unitRateUsd: overageRate,
      capEnforcement: 'NOTIFICATIONS_AND_OVERAGE_BILLING',
    };

    return {
      tenantId,
      recordsCount: records.length,
      acceptedTotal,
      billableTotal,
      nonBillableCount,
      committedQuantity,
      currentUsage: billableTotal,
      projectedForecast,
      warningThresholds,
      overageRatePolicy,
      recentRecords: records.slice(0, 10),
    };
  }

  /**
   * Get protected resource inventory for a tenant
   */
  async getResourceObservations(tenantId: string) {
    return this.prisma.resourceObservation.findMany({
      where: { tenant_id: tenantId },
      orderBy: { last_seen_at: 'desc' },
    });
  }
}

