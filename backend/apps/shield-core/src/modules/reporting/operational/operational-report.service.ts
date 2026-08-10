import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportHealthPropagationService, HealthState } from '../source-health/report-health-propagation.service';

/**
 * Operational summaries are live aggregate queries (unlike executive
 * reporting, which must use a frozen snapshot — spec §8/§9) — but every
 * response still discloses population/period/source and never collapses
 * PARTIAL/UNKNOWN inputs into a fake green summary.
 */
@Injectable()
export class OperationalReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthPropagation: ReportHealthPropagationService,
  ) {}

  async getSecuritySummary(tenantId: string) {
    const [openAlerts, criticalAlerts, openCases, casesAwaitingCustomer] = await Promise.all([
      this.prisma.alert.count({ where: { tenant_id: tenantId, status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.alert.count({ where: { tenant_id: tenantId, severity: 'CRITICAL', status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.case.count({ where: { tenant_id: tenantId, status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
      this.prisma.case.count({ where: { tenant_id: tenantId, disposition: 'CUSTOMER_ACTION_REQUIRED' } }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      metrics: { openAlerts, criticalAlerts, openCases, casesAwaitingCustomer },
      definition: 'Live counts as of generation time — not a frozen snapshot',
      limitations: ['connectorCoverage/detectionCoverage require connector-health wiring not built this pass'],
    };
  }

  async getAssuranceSummary(tenantId: string) {
    const [effective, partial, ineffective, unknown, evidenceGapsOpen, activeRisks, activeExceptions] = await Promise.all([
      this.prisma.assessment.count({ where: { tenant_id: tenantId, effectiveness: 'EFFECTIVE' } }),
      this.prisma.assessment.count({ where: { tenant_id: tenantId, effectiveness: 'PARTIALLY_EFFECTIVE' } }),
      this.prisma.assessment.count({ where: { tenant_id: tenantId, effectiveness: 'INEFFECTIVE' } }),
      this.prisma.assessment.count({ where: { tenant_id: tenantId, effectiveness: 'UNKNOWN' } }),
      this.prisma.evidenceGap.count({ where: { tenant_id: tenantId, status: 'OPEN' } }),
      this.prisma.risk.count({ where: { tenant_id: tenantId, status: 'OPEN' } }),
      this.prisma.exception.count({ where: { tenant_id: tenantId, status: 'APPROVED', expires_at: { gt: new Date() } } }),
    ]);
    const expiredRiskAcceptances = await this.prisma.riskAcceptance.count({ where: { tenant_id: tenantId, status: 'ACTIVE', expires_at: { lte: new Date() } } });
    const expiredExceptions = await this.prisma.exception.count({ where: { tenant_id: tenantId, status: { in: ['APPROVED', 'REQUESTED'] }, expires_at: { lte: new Date() } } });

    const health: HealthState = ineffective > 0 ? 'DEGRADED' : unknown > 0 || partial > 0 ? 'PARTIAL' : effective > 0 ? 'HEALTHY' : 'UNKNOWN';

    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      metrics: {
        controlsEffective: effective, controlsPartiallyEffective: partial, controlsIneffective: ineffective, controlsUnknown: unknown,
        evidenceGapsOpen, activeRisks, activeExceptions, expiredRiskAcceptances, expiredExceptions,
      },
      healthState: health,
      definition: 'Live counts derived directly from Assessment/EvidenceGap/Risk/Exception rows',
    };
  }

  async getAuditPackageSummary(tenantId: string) {
    const [ready, incomplete, frozen] = await Promise.all([
      this.prisma.auditPackage.count({ where: { tenant_id: tenantId, status: 'READY_FOR_REVIEW' } }),
      this.prisma.auditPackage.count({ where: { tenant_id: tenantId, status: 'INCOMPLETE' } }),
      this.prisma.auditPackage.count({ where: { tenant_id: tenantId, status: 'FROZEN' } }),
    ]);
    return { generatedAt: new Date().toISOString(), tenantId, metrics: { packagesReady: ready, packagesIncomplete: incomplete, packagesFrozen: frozen } };
  }

  async getServiceHealthSummary(tenantId: string) {
    const connectorHealthy = await this.prisma.connectorHealthStatus.count({ where: { tenant_id: tenantId, state: 'HEALTHY' } }).catch(() => null);
    const connectorTotal = await this.prisma.connectorInstance.count({ where: { tenant_id: tenantId } }).catch(() => null);

    const health = this.healthPropagation.combine([
      connectorHealthy === null || connectorTotal === null ? 'UNKNOWN' : connectorHealthy === connectorTotal && connectorTotal > 0 ? 'HEALTHY' : connectorTotal === 0 ? 'UNKNOWN' : 'DEGRADED',
    ]);

    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      connectorHealth: connectorTotal === null ? 'UNKNOWN' : { healthy: connectorHealthy, total: connectorTotal },
      overallHealth: health,
      limitations: ['AIAvailability/actionSimulationHealth/evidenceLedgerHealth/anchorHealth require live cross-app health checks not wired this pass — reported as UNKNOWN, never assumed healthy'],
      aiAvailability: 'UNKNOWN',
      actionSimulationHealth: 'UNKNOWN',
      evidenceLedgerHealth: 'UNKNOWN',
      anchorHealth: 'UNKNOWN',
    };
  }
}
