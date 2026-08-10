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
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
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
}
