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

    const openAlertStatuses = ['NEW', 'ACKNOWLEDGED', 'INVESTIGATING'];
    const closedCaseStatuses = [
      'RESOLVED',
      'CLOSED',
      'DUPLICATE',
      'FALSE_POSITIVE',
    ];

    // One grouped query per table instead of one count per figure: 8 queries
    // rather than 15, so a single dashboard load no longer drains the pool.
    const [
      connectorsByState,
      eventsByStatus,
      openAlertsBySeverity,
      casesByStatus,
      controlsByStatus,
      currentEvidence,
      staleEvidence,
      missingEvidence,
    ] = await Promise.all([
      this.prisma.connectorInstance.groupBy({
        by: ['state'],
        where: { tenant_id: tenantId },
        _count: { _all: true },
      }),
      this.prisma.rawEvent.groupBy({
        by: ['processing_status'],
        where: {
          tenant_id: tenantId,
          received_at: { gte: twentyFourHoursAgo },
        },
        _count: { _all: true },
      }),
      this.prisma.alert.groupBy({
        by: ['severity'],
        where: { tenant_id: tenantId, status: { in: openAlertStatuses } },
        _count: { _all: true },
      }),
      this.prisma.case.groupBy({
        by: ['status'],
        where: { tenant_id: tenantId },
        _count: { _all: true },
      }),
      this.prisma.controlImplementation.groupBy({
        by: ['status'],
        where: {
          tenant_id: tenantId,
          status: { in: ['IMPLEMENTED', 'PARTIAL', 'PLANNED'] },
        },
        _count: { _all: true },
      }),
      // Evidence health counts
      this.prisma.evidenceRecord.count({
        where: { tenant_id: tenantId, created_at: { gte: thirtyDaysAgo } },
      }),
      this.prisma.evidenceRecord.count({
        where: { tenant_id: tenantId, created_at: { lt: thirtyDaysAgo } },
      }),
      this.prisma.evidenceGap.count({
        where: { tenant_id: tenantId, resolved_at: null },
      }),
    ]);

    const connectors = countsBy(connectorsByState, (row) => row.state);
    const events = countsBy(eventsByStatus, (row) => row.processing_status);
    const openAlerts = countsBy(openAlertsBySeverity, (row) => row.severity);
    const cases = countsBy(casesByStatus, (row) => row.status);
    const controls = countsBy(controlsByStatus, (row) => row.status);

    const totalConnectors = total(connectors);
    const healthyConnectors = connectors['HEALTHY'] ?? 0;
    const degradedConnectors = connectors['DEGRADED'] ?? 0;
    const received24h = total(events);
    const quarantined24h = events['QUARANTINED'] ?? 0;
    const criticalAlerts = openAlerts['CRITICAL'] ?? 0;
    const openCases = Object.entries(cases)
      .filter(([status]) => !closedCaseStatuses.includes(status))
      .reduce((sum, [, count]) => sum + count, 0);
    const investigatingCases = cases['INVESTIGATING'] ?? 0;
    const effectiveControls = controls['IMPLEMENTED'] ?? 0;
    const partialControls = controls['PARTIAL'] ?? 0;
    const unknownControls = controls['PLANNED'] ?? 0;

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
        open: total(openAlerts),
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

    const [totalRaw, totalAccepted, totalQuarantined, raw24h] =
      await Promise.all([
        this.prisma.rawEvent.count({ where: { tenant_id: tenantId } }),
        this.prisma.rawEvent.count({
          where: { tenant_id: tenantId, processing_status: 'ACCEPTED' },
        }),
        this.prisma.rawEvent.count({
          where: { tenant_id: tenantId, processing_status: 'QUARANTINED' },
        }),
        this.prisma.rawEvent.count({
          where: {
            tenant_id: tenantId,
            received_at: { gte: twentyFourHoursAgo },
          },
        }),
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
    // Counted in Postgres: loading every row just to tally it grew with history.
    const groups = await this.prisma.alert.groupBy({
      by: ['severity', 'status'],
      where: { tenant_id: tenantId },
      _count: { _all: true },
    });
    const bySeverity = countsBy(groups, (row) => row.severity);
    const byStatus = countsBy(groups, (row) => row.status);

    return {
      total: total(byStatus),
      bySeverity,
      byStatus,
    };
  }

  /**
   * GET /api/v1/dashboard/cases
   */
  async getCaseMetrics(tenantId: string) {
    // Counted in Postgres: loading every row just to tally it grew with history.
    const groups = await this.prisma.case.groupBy({
      by: ['severity', 'status'],
      where: { tenant_id: tenantId },
      _count: { _all: true },
    });
    const bySeverity = countsBy(groups, (row) => row.severity);
    const byStatus = countsBy(groups, (row) => row.status);

    return {
      total: total(byStatus),
      bySeverity,
      byStatus,
    };
  }

  /**
   * GET /api/v1/dashboard/control-health
   * Control effectiveness breakdown and deficiency count
   */
  async getControlHealth(tenantId: string) {
    const testDelegate =
      this.prisma.controlTestRun || (this.prisma as any).controlTest;
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

    const [currentEvidence, staleEvidence, openGaps, recentRecords] =
      await Promise.all([
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
          select: {
            id: true,
            producing_service: true,
            integrity_state: true,
            created_at: true,
          },
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

/** Folds a Prisma groupBy result into { key: count }. */
function countsBy<T extends { _count: { _all: number } }>(
  rows: T[],
  key: (row: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[key(row)] = (counts[key(row)] ?? 0) + row._count._all;
  }
  return counts;
}

function total(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
