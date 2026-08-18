import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportSnapshotService } from '../snapshots/report-snapshot.service';

/**
 * Every composite metric exposes its factors — never an opaque number like
 * securityScore=87 (spec §8/§10). Built strictly from an already-frozen
 * ReportSnapshot, never a fresh live query.
 */
@Injectable()
export class ExecutiveReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportSnapshotService: ReportSnapshotService,
  ) {}

  async createFromSnapshot(
    tenantId: string,
    reportSnapshotId: string,
    reportingPeriod: string,
  ) {
    const snapshot = await this.reportSnapshotService.getById(
      tenantId,
      reportSnapshotId,
    );
    const payload = JSON.parse(snapshot.payload);
    const limitations: string[] = JSON.parse(snapshot.limitations);

    const assuranceMetrics = payload.assurance?.metrics ?? {};
    const metrics = [
      {
        key: 'control_effectiveness_rate',
        value: this.safeRate(
          assuranceMetrics.controlsEffective,
          assuranceMetrics.controlsEffective +
            assuranceMetrics.controlsPartiallyEffective +
            assuranceMetrics.controlsIneffective +
            assuranceMetrics.controlsUnknown,
        ),
        factors: [
          {
            label: 'controlsEffective',
            value: assuranceMetrics.controlsEffective,
          },
          {
            label: 'controlsPartiallyEffective',
            value: assuranceMetrics.controlsPartiallyEffective,
          },
          {
            label: 'controlsIneffective',
            value: assuranceMetrics.controlsIneffective,
          },
          {
            label: 'controlsUnknown (counted against the rate, never dropped)',
            value: assuranceMetrics.controlsUnknown,
          },
        ],
        unknownInputs: assuranceMetrics.controlsUnknown,
        sourceRefs: ['assessment'],
        definitionRef: 'controlsEffective / totalAssessedControls',
        period: reportingPeriod,
        snapshotVersion: snapshot.id,
      },
      {
        key: 'open_alert_count',
        value: payload.security?.metrics?.openAlerts ?? null,
        factors: [
          { label: 'openAlerts', value: payload.security?.metrics?.openAlerts },
          {
            label: 'criticalAlerts',
            value: payload.security?.metrics?.criticalAlerts,
          },
        ],
        sourceRefs: ['alert'],
        definitionRef: 'count(Alert where status not in [CLOSED, RESOLVED])',
        period: reportingPeriod,
        snapshotVersion: snapshot.id,
      },
    ];

    const executiveSnapshot = await this.prisma.executiveReportSnapshot.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        report_snapshot_id: snapshot.id,
        reporting_period: reportingPeriod,
        metrics: JSON.stringify(metrics),
        known_limitations: JSON.stringify(limitations),
        source_refs: snapshot.source_snapshot_refs,
      },
    });
    return executiveSnapshot;
  }

  async approve(
    tenantId: string,
    executiveSnapshotId: string,
    approverId: string,
  ) {
    const existing = await this.prisma.executiveReportSnapshot.findFirst({
      where: { id: executiveSnapshotId, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException(
        `ExecutiveReportSnapshot '${executiveSnapshotId}' not found`,
      );
    }
    return this.prisma.executiveReportSnapshot.update({
      where: { id: existing.id },
      data: { approved_by: approverId, approved_at: new Date() },
    });
  }

  private safeRate(numerator: number, denominator: number): number | null {
    if (!denominator) return null;
    return Math.round((numerator / denominator) * 1000) / 1000;
  }
}
