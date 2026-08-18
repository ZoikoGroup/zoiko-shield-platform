import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { HealthState } from '../source-health/report-health-propagation.service';

export interface UpsertProjectionInput {
  tenantId: string;
  environmentId?: string;
  projectionType: string;
  sourceDomain: string;
  sourceObjectId: string;
  sourceVersion?: string;
  sourceOccurredAt?: Date;
  freshnessState: string;
  completenessState: string;
  healthState: HealthState;
  payload: Record<string, unknown>;
}

/**
 * Reporting NEVER writes back into authoritative domain tables (spec §2) —
 * this is the one place projections are written, always keyed by
 * (tenant, projectionType, sourceObjectId) so a later event supersedes the
 * prior projection version rather than accumulating duplicates.
 */
@Injectable()
export class ReportingProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertProjectionInput) {
    const existing = await this.prisma.reportingProjection.findFirst({
      where: {
        tenant_id: input.tenantId,
        projection_type: input.projectionType,
        source_object_id: input.sourceObjectId,
      },
    });

    const data = {
      tenant_id: input.tenantId,
      environment_id: input.environmentId,
      projection_type: input.projectionType,
      source_domain: input.sourceDomain,
      source_object_id: input.sourceObjectId,
      source_version: input.sourceVersion,
      source_occurred_at: input.sourceOccurredAt,
      source_recorded_at: new Date(),
      freshness_state: input.freshnessState,
      completeness_state: input.completenessState,
      health_state: input.healthState,
      payload: JSON.stringify(input.payload),
      last_reconciled_at: new Date(),
    };

    if (existing) {
      return this.prisma.reportingProjection.update({
        where: { id: existing.id },
        data: { ...data, projection_version: existing.projection_version + 1 },
      });
    }
    return this.prisma.reportingProjection.create({
      data: { id: randomUUID(), ...data, projection_version: 1 },
    });
  }

  async listForTenant(tenantId: string, projectionType?: string) {
    return this.prisma.reportingProjection.findMany({
      where: {
        tenant_id: tenantId,
        ...(projectionType ? { projection_type: projectionType } : {}),
      },
      orderBy: { updated_at: 'desc' },
    });
  }
}
