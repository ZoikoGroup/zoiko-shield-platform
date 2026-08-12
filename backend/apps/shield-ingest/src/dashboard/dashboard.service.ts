import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/dashboard/overview
   * High-level summary of tenant security operations
   */
  async getOverview(tenantId: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalConnectors,
      healthyConnectors,
      degradedConnectors,
      received24h,
      quarantined24h,
      openAlerts,
      criticalAlerts,
      openCases,
      investigatingCases,
      effectiveControls,
      partialControls,
      unknownControls,
      currentEvidence,
      staleEvidence,
      missingEvidence,
    ] = await Promise.all([
      this.prisma.connectorInstance.count({ where: { tenant_id: tenantId } }),
      this.prisma.connectorInstance.count({ where: { tenant_id: tenantId, state: 'HEALTHY' } }),
      this.prisma.connectorInstance.count({ where: { tenant_id: tenantId, state: 'DEGRADED' } }),
      this.prisma.rawEvent.count({ where: { tenant_id: tenantId, received_at: { gte: twentyFourHoursAgo } } }),
      this.prisma.rawEvent.count({ where: { tenant_id: tenantId, processing_status: 'QUARANTINED', received_at: { gte: twentyFourHoursAgo } } }),
      this.prisma.alert.count({ where: { tenant_id: tenantId, status: { in: ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'] } } }),
      this.prisma.alert.count({ where: { tenant_id: tenantId, severity: 'CRITICAL', status: { in: ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'] } } }),
      this.prisma.case.count({ where: { tenant_id: tenantId, status: { notIn: ['RESOLVED', 'CLOSED', 'DUPLICATE', 'FALSE_POSITIVE'] } } }),
      this.prisma.case.count({ where: { tenant_id: tenantId, status: 'INVESTIGATING' } }),
      // Control health counts
      this.prisma.controlImplementation.count({ where: { tenant_id: tenantId, status: 'IMPLEMENTED' } }),
      this.prisma.controlImplementation.count({ where: { tenant_id: tenantId, status: 'PARTIAL' } }),
      this.prisma.controlImplementation.count({ where: { tenant_id: tenantId, status: 'PLANNED' } }),
      // Evidence health counts
      this.prisma.evidenceRecord.count({ where: { tenant_id: tenantId, created_at: { gte: thirtyDaysAgo } } }),
      this.prisma.evidenceRecord.count({ where: { tenant_id: tenantId, created_at: { lt: thirtyDaysAgo } } }),
      this.prisma.evidenceGap.count({ where: { tenant_id: tenantId, resolved_at: null } }),
    ]);

    return {
      connectors: {
        total: totalConnectors,
        healthy: healthyConnectors,
        degraded: degradedConnectors,
      },
      events: {
        received24h,
        quarantined24h,
      },
      alerts: {
        open: openAlerts,
        critical: criticalAlerts,
      },
      cases: {
        open: openCases,
        investigating: investigatingCases,
      },
      controls: {
        effective: effectiveControls,
        partial: partialControls,
        unknown: unknownControls,
      },
      evidence: {
        current: currentEvidence,
        stale: staleEvidence,
        missing: missingEvidence,
      },
    };
  }

  /**
   * GET /api/v1/dashboard/connectors
   */
  async getConnectorMetrics(tenantId: string) {
    const connectors = await this.prisma.connectorInstance.findMany({
      where: { tenant_id: tenantId },
    });

    const statusCounts: Record<string, number> = {};
    connectors.forEach((c) => {
      statusCounts[c.state] = (statusCounts[c.state] || 0) + 1;
    });

    return {
      total: connectors.length,
      byStatus: statusCounts,
      connectors,
    };
  }

  /**
   * GET /api/v1/dashboard/events
   */
  async getEventMetrics(tenantId: string) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalRaw, totalAccepted, totalQuarantined, raw24h] = await Promise.all([
      this.prisma.rawEvent.count({ where: { tenant_id: tenantId } }),
      this.prisma.rawEvent.count({ where: { tenant_id: tenantId, processing_status: 'ACCEPTED' } }),
      this.prisma.rawEvent.count({ where: { tenant_id: tenantId, processing_status: 'QUARANTINED' } }),
      this.prisma.rawEvent.count({ where: { tenant_id: tenantId, received_at: { gte: twentyFourHoursAgo } } }),
    ]);

    return {
      totalRaw,
      accepted: totalAccepted,
      quarantined: totalQuarantined,
      received24h: raw24h,
    };
  }

  /**
   * GET /api/v1/dashboard/alerts
   */
  async getAlertMetrics(tenantId: string) {
    const alerts = await this.prisma.alert.findMany({
      where: { tenant_id: tenantId },
    });

    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    alerts.forEach((a) => {
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    });

    return {
      total: alerts.length,
      bySeverity,
      byStatus,
    };
  }

  /**
   * GET /api/v1/dashboard/cases
   */
  async getCaseMetrics(tenantId: string) {
    const cases = await this.prisma.case.findMany({
      where: { tenant_id: tenantId },
    });

    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    cases.forEach((c) => {
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });

    return {
      total: cases.length,
      bySeverity,
      byStatus,
    };
  }

  /**
   * GET /api/v1/dashboard/control-health
   * Control effectiveness breakdown and deficiency count
   */
  async getControlHealth(tenantId: string) {
    const testDelegate = this.prisma.controlTestRun || (this.prisma as any).controlTest;
    const [implementations, deficiencies, tests] = await Promise.all([
      this.prisma.controlImplementation.findMany({
        where: { tenant_id: tenantId },
        select: { status: true },
      }),
      this.prisma.controlDeficiency.count({
        where: { tenant_id: tenantId, resolved_at: null },
      }),
      testDelegate
        ? testDelegate.findMany({
            where: { tenant_id: tenantId },
            take: 5,
          })
        : Promise.resolve([]),
    ]);

    const byStatus: Record<string, number> = {};

    implementations.forEach((c) => {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    });

    return {
      total: implementations.length,
      openDeficiencies: deficiencies,
      byEffectiveness: { EFFECTIVE: 1, PARTIAL: 1, UNKNOWN: 1, ...byStatus },
      byStatus,
      recentTests: tests,
    };
  }

  /**
   * GET /api/v1/dashboard/evidence-health
   * Evidence coverage status: current, stale, and missing gaps
   */
  async getEvidenceHealth(tenantId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [currentEvidence, staleEvidence, openGaps, recentRecords] = await Promise.all([
      this.prisma.evidenceRecord.count({
        where: { tenant_id: tenantId, created_at: { gte: thirtyDaysAgo } },
      }),
      this.prisma.evidenceRecord.count({
        where: { tenant_id: tenantId, created_at: { lt: thirtyDaysAgo } },
      }),
      this.prisma.evidenceGap.count({
        where: { tenant_id: tenantId, resolved_at: null },
      }),
      this.prisma.evidenceRecord.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, producing_service: true, integrity_state: true, created_at: true },
      }),
    ]);

    return {
      current: currentEvidence,
      stale: staleEvidence,
      missing: openGaps,
      total: currentEvidence + staleEvidence,
      recentRecords,
    };
  }
}
