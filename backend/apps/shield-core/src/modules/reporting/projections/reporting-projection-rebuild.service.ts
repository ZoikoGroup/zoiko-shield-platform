import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportingProjectionService } from './reporting-projection.service';

/**
 * ReportingProjection is rebuildable, never authoritative (spec §4) — every
 * row retains sourceDomain/sourceObjectId/sourceVersion/lastReconciledAt so
 * it can always be regenerated from the domain tables it summarizes.
 * Rebuilding CASE_POSTURE re-derives from live Case/Alert rows; a mismatch
 * against what was projected is recorded, not silently overwritten as if
 * nothing happened.
 */
@Injectable()
export class ReportingProjectionRebuildService {
  private readonly logger = new Logger(ReportingProjectionRebuildService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionService: ReportingProjectionService,
  ) {}

  /** Rebuilds CASE_POSTURE projections for a tenant from live Case rows — the one concrete rebuildable projection type implemented this pass. */
  async rebuildCasePosture(tenantId: string): Promise<{ rebuilt: number; mismatches: number }> {
    const cases = await this.prisma.case.findMany({ where: { tenant_id: tenantId } });
    let mismatches = 0;

    for (const c of cases) {
      const before = await this.prisma.reportingProjection.findFirst({ where: { tenant_id: tenantId, projection_type: 'CASE_POSTURE', source_object_id: c.id } });
      const expectedPayload = JSON.stringify({ status: c.status, severity: c.severity, priority: c.priority });
      if (before && before.payload !== expectedPayload) {
        mismatches++;
        this.logger.warn(`Reconciliation mismatch for CASE_POSTURE/${c.id}: projection was stale relative to authoritative Case row`);
      }
      await this.projectionService.upsert({
        tenantId,
        projectionType: 'CASE_POSTURE',
        sourceDomain: 'case-management',
        sourceObjectId: c.id,
        sourceVersion: c.status,
        sourceOccurredAt: c.updated_at,
        freshnessState: 'CURRENT',
        completenessState: 'COMPLETE',
        healthState: c.status === 'CLOSED' || c.status === 'RESOLVED' ? 'HEALTHY' : 'PARTIAL',
        payload: { status: c.status, severity: c.severity, priority: c.priority },
      });
    }

    return { rebuilt: cases.length, mismatches };
  }
}
