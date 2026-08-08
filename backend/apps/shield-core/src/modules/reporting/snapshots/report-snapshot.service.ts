import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { ReportDefinitionService } from './report-definition.service';
import { OperationalReportService } from '../operational/operational-report.service';

/**
 * Immutable, versioned snapshots — executive/board reporting must never
 * assemble from arbitrary live queries at render time (spec §8). Freezes
 * source references + computes a snapshot hash before anything downstream
 * (ExecutiveReportSnapshot) can be built from it.
 */
@Injectable()
export class ReportSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly reportDefinitionService: ReportDefinitionService,
    private readonly operationalReportService: OperationalReportService,
  ) {}

  async build(params: { tenantId: string; environmentId?: string; reportDefinitionId: string; periodStart: Date; periodEnd: Date; generatedBy: string }) {
    const definition = await this.reportDefinitionService.getById(params.reportDefinitionId);

    const [security, assurance, auditPackages] = await Promise.all([
      this.operationalReportService.getSecuritySummary(params.tenantId),
      this.operationalReportService.getAssuranceSummary(params.tenantId),
      this.operationalReportService.getAuditPackageSummary(params.tenantId),
    ]);

    const sourceSnapshotRefs = [{ domain: 'security', capturedAt: security.generatedAt }, { domain: 'assurance', capturedAt: assurance.generatedAt }, { domain: 'audit-package', capturedAt: auditPackages.generatedAt }];
    const payload = { security, assurance, auditPackages };
    const { contentHash: snapshotHash } = this.hashService.hashCanonicalJson(payload);

    const limitations: string[] = [];
    if ((assurance.metrics as any).controlsUnknown > 0) limitations.push(`${(assurance.metrics as any).controlsUnknown} controls have UNKNOWN effectiveness`);
    if ((assurance.metrics as any).expiredRiskAcceptances > 0) limitations.push(`${(assurance.metrics as any).expiredRiskAcceptances} risk acceptances have expired`);

    const snapshot = await this.prisma.reportSnapshot.create({
      data: {
        id: randomUUID(),
        tenant_id: params.tenantId,
        environment_id: params.environmentId,
        report_definition_id: definition.id,
        report_definition_version: definition.status,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        generated_by: params.generatedBy,
        source_snapshot_refs: JSON.stringify(sourceSnapshotRefs),
        source_versions: JSON.stringify(sourceSnapshotRefs.map((s) => s.domain)),
        freshness_state: 'CURRENT',
        completeness_state: limitations.length > 0 ? 'PARTIAL' : 'COMPLETE',
        limitations: JSON.stringify(limitations),
        payload: JSON.stringify(payload),
        snapshot_hash: snapshotHash,
        status: 'READY',
      },
    });

    return { snapshot, payload };
  }

  async getById(tenantId: string, snapshotId: string) {
    const snapshot = await this.prisma.reportSnapshot.findFirst({ where: { id: snapshotId, tenant_id: tenantId } });
    if (!snapshot) {
      throw new NotFoundException(`ReportSnapshot '${snapshotId}' not found`);
    }
    return snapshot;
  }
}
