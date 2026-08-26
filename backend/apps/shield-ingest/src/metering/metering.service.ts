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
  usageState?:
    | 'OBSERVED'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'DUPLICATE'
    | 'QUARANTINED'
    | 'PROCESSING_LOSS'
    | 'PLATFORM_DERIVED'
    | 'BILLABLE'
    | 'NON_BILLABLE';
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
   * Records telemetry usage observations enforcing ZS-COM-BILL-001 data class rules.
   * This raw-ingest compatibility record is observation evidence only. It is
   * never billing authority: governed core metering creates the separate
   * contract-bound UsageRecord only after validation and deduplication.
   */
  async recordUsageObservation(dto: UsageObservationDto) {
    const environmentId = requireEnvironmentId(dto.environmentId);
    const intakeState = dto.usageState || 'OBSERVED';
    const unaccepted = [
      'REJECTED',
      'DUPLICATE',
      'QUARANTINED',
      'PROCESSING_LOSS',
    ].includes(intakeState);
    const acceptedQty = unaccepted ? 0 : (dto.acceptedQuantity ?? 1);
    const usageClassification = unaccepted
      ? `INGESTION_${intakeState}_NON_BILLABLE`
      : intakeState === 'PLATFORM_DERIVED'
        ? 'PLATFORM_GENERATED_NON_BILLABLE'
        : 'INGESTION_PENDING_GOVERNED_VALIDATION';

    return this.prisma.usageRecord.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: environmentId,
        meter_version: 'v1.0',
        source_type: dto.sourceType,
        raw_event_id: dto.rawEventId,
        unit: dto.unit || 'EVENTS',
        accepted_quantity: acceptedQty,
        billable_quantity: 0,
        usage_state: 'NON_BILLABLE',
        usage_classification: usageClassification,
        billing_classification:
          dto.billingClassification || 'COMMERCIAL_DIRECT',
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

    const acceptedTotal = records.reduce(
      (acc, r) => acc + r.accepted_quantity,
      0,
    );
    const billableTotal = records.reduce(
      (acc, r) => acc + r.billable_quantity,
      0,
    );
    const nonBillableCount = records.filter(
      (r) => r.usage_state === 'NON_BILLABLE',
    ).length;

    // Commitment values come only from approved, active contract policies.
    // Multiple meter/unit commitments are not collapsed into an invented sum.
    let commitments: any[] = [];
    try {
      commitments =
        (await (this.prisma as any).meterAuthorizationPolicy?.findMany({
          where: {
            tenant_id: tenantId,
            status: 'APPROVED',
            pricing_model: 'COMMITTED_CAPACITY',
            contract: { status: 'ACTIVE' },
          },
          include: { meterDefinition: true },
          orderBy: [{ meter_definition_id: 'asc' }, { version: 'desc' }],
        })) ?? [];
    } catch (err) {
      this.logger.warn(`Could not load governed commitments: ${err}`);
    }
    const singleCommitment = commitments.length === 1 ? commitments[0] : null;
    const committedQuantity = singleCommitment?.committed_quantity ?? null;

    // Calculate run-rate projected forecast based on active records timeline
    let projectedForecast = billableTotal;
    if (records.length > 1) {
      const oldestRecord = records[records.length - 1];
      const newestRecord = records[0];
      const timeSpanMs =
        newestRecord.recorded_at.getTime() - oldestRecord.recorded_at.getTime();
      const timeSpanHours = timeSpanMs / (1000 * 60 * 60);

      if (timeSpanHours > 0) {
        const hourlyRate = billableTotal / timeSpanHours;
        projectedForecast = Math.round(hourlyRate * 720);
      }
    }

    // Warning thresholds per MET-03 (80%, 90%, 100%)
    const utilizationPercentage =
      committedQuantity && committedQuantity > 0
        ? (acceptedTotal / committedQuantity) * 100
        : 0;
    let thresholdStatus:
      | 'NOT_CONFIGURED'
      | 'MULTIPLE_POLICIES'
      | 'NORMAL'
      | 'WARNING_80'
      | 'WARNING_90'
      | 'EXCEEDED_100' = singleCommitment
      ? 'NORMAL'
      : commitments.length
        ? 'MULTIPLE_POLICIES'
        : 'NOT_CONFIGURED';
    if (singleCommitment && utilizationPercentage >= 100) {
      thresholdStatus = 'EXCEEDED_100';
    } else if (singleCommitment && utilizationPercentage >= 90) {
      thresholdStatus = 'WARNING_90';
    } else if (singleCommitment && utilizationPercentage >= 80) {
      thresholdStatus = 'WARNING_80';
    }

    const warningThresholds = {
      capacity80: committedQuantity
        ? Math.round(committedQuantity * 0.8)
        : null,
      capacity90: committedQuantity
        ? Math.round(committedQuantity * 0.9)
        : null,
      capacity100: committedQuantity,
      utilizationPercentage: Number(utilizationPercentage.toFixed(2)),
      status: thresholdStatus,
    };

    const overageRatePolicy = {
      policy: singleCommitment?.overage_behavior ?? 'NOT_CONFIGURED',
      unitRateUsd: singleCommitment?.overage_rate ?? null,
      capEnforcement: singleCommitment
        ? 'GOVERNED_BY_CONTRACT_POLICY'
        : 'NO_INVENTED_OVERAGE_POLICY',
    };

    return {
      tenantId,
      recordsCount: records.length,
      acceptedTotal,
      billableTotal,
      nonBillableCount,
      committedQuantity,
      commitments: commitments.map((policy) => ({
        policyId: policy.id,
        contractId: policy.contract_id,
        meterDefinitionId: policy.meter_definition_id,
        unit: policy.meterDefinition?.unit,
        committedQuantity: policy.committed_quantity,
        overageBehavior: policy.overage_behavior,
        overageRate: policy.overage_rate,
      })),
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
