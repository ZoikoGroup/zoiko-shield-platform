import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
   * Records telemetry usage observations enforcing ZS-COM-BILL-001 data class rules.
   * Duplicate, rejected, quarantined, and platform-generated records are explicitly NON_BILLABLE.
   */
  async recordUsageObservation(dto: UsageObservationDto) {
    const environmentId = dto.environmentId || 'default-env';
    const acceptedQty = dto.acceptedQuantity !== undefined ? dto.acceptedQuantity : 1;

    // Force NON_BILLABLE and billableQuantity = 0 for duplicate, rejected, or quarantined states
    let usageState = dto.usageState || 'ACCEPTED';
    let billableQty = dto.billableQuantity || 0;

    if (['REJECTED', 'DUPLICATE', 'QUARANTINED', 'PLATFORM_DERIVED'].includes(usageState)) {
      usageState = 'NON_BILLABLE';
      billableQty = 0;
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
    const environmentId = dto.environmentId || 'default-env';

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
   * Get telemetry usage summary for a tenant
   */
  async getUsageSummary(tenantId: string) {
    const records = await this.prisma.usageRecord.findMany({
      where: { tenant_id: tenantId },
      orderBy: { recorded_at: 'desc' },
      take: 100,
    });

    const acceptedTotal = records.reduce((acc, r) => acc + r.accepted_quantity, 0);
    const billableTotal = records.reduce((acc, r) => acc + r.billable_quantity, 0);
    const nonBillableCount = records.filter(r => r.usage_state === 'NON_BILLABLE').length;

    return {
      tenantId,
      recordsCount: records.length,
      acceptedTotal,
      billableTotal,
      nonBillableCount,
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
