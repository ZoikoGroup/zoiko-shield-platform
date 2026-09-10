import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  ExperienceStateEnvelope,
  ExperienceStateStatus,
  CommandCenterOverviewData,
  CaseTriageDetailData,
  EvidenceFreshnessData,
} from './interfaces/experience-state.interface';

/**
 * Customer & Analyst Experience Command Center BFF Service
 * Specification: MASTER_BUILD_PLAN.md §7 Step 8 (Experience-Facing APIs / LAB 14)
 *
 * Enforces explicit UI state envelopes:
 * - LOADING: Initial query processing
 * - PARTIAL: Asynchronous telemetry or AI narrative incomplete
 * - STALE: Telemetry freshness exceeds grace threshold (> 60s)
 * - DEGRADED: Partial upstream connector/AI fallback in effect
 * - UNAUTHORIZED: Missing or cross-tenant context access
 * - UNAVAILABLE: Hard dependency outage with recovery SLA
 * - RECOVERY_IN_PROGRESS: Failover / reconciliation executing
 * - HEALTHY_SYNCED: Optimal synchronized state
 */
@Injectable()
export class CommandCenterBffService {
  private readonly logger = new Logger(CommandCenterBffService.name);

  // In-memory tenant state store for BFF demo/unit evaluation
  private readonly tenantStates = new Map<
    string,
    {
      lastTelemetryTime: number;
      isDegraded: boolean;
      degradedReason?: string;
      isRecoveryInProgress?: boolean;
    }
  >();

  setTenantTelemetryState(
    tenantId: string,
    state: {
      lastTelemetryTime: number;
      isDegraded: boolean;
      degradedReason?: string;
      isRecoveryInProgress?: boolean;
    },
  ): void {
    this.tenantStates.set(tenantId, state);
  }

  /**
   * Retrieves high-level security & continuous compliance posture overview.
   */
  async getOverview(
    tenantId: string,
    correlationId: string,
  ): Promise<ExperienceStateEnvelope<CommandCenterOverviewData>> {
    if (!tenantId || tenantId.trim() === '') {
      throw new UnauthorizedException('Missing tenant context identifier.');
    }

    const state = this.tenantStates.get(tenantId) || {
      lastTelemetryTime: Date.now(),
      isDegraded: false,
    };

    const now = Date.now();
    const ageSeconds = Math.round((now - state.lastTelemetryTime) / 1000);
    const nowIso = new Date().toISOString();

    let status: ExperienceStateStatus = 'HEALTHY_SYNCED';
    let isStale = false;
    let isPartial = false;

    if (state.isRecoveryInProgress) {
      status = 'RECOVERY_IN_PROGRESS';
      isPartial = true;
    } else if (state.isDegraded) {
      status = 'DEGRADED';
      isPartial = true;
    } else if (ageSeconds > 60) {
      status = 'STALE';
      isStale = true;
    }

    const overviewData: CommandCenterOverviewData = {
      tenantId,
      securityScore:
        status === 'HEALTHY_SYNCED' ? 96 : status === 'DEGRADED' ? 78 : 88,
      compliancePosturePct: status === 'HEALTHY_SYNCED' ? 100 : 92.5,
      activeIncidentsCount: 1,
      unresolvedAlertsCount: 3,
      freshnessStatus: isStale ? 'WARNING' : 'FRESH',
      monitoredAssetsCount: 420,
      regionalCell: 'europe-west3',
      lastTelemetryTimestamp: new Date(state.lastTelemetryTime).toISOString(),
    };

    return {
      status,
      data: overviewData,
      isPartial,
      isStale,
      staleGracePeriodSeconds: isStale ? 120 : undefined,
      degradedReason: state.degradedReason,
      recoveryEstimateMs: state.isRecoveryInProgress ? 5000 : undefined,
      lastSyncedAt: nowIso,
      correlationId,
      tenantId,
    };
  }

  /**
   * Retrieves case investigation and forensic triage detail with AI grounding citations.
   */
  async getCaseDetail(
    tenantId: string,
    caseId: string,
    correlationId: string,
  ): Promise<ExperienceStateEnvelope<CaseTriageDetailData>> {
    if (!tenantId || tenantId.trim() === '') {
      throw new UnauthorizedException('Missing tenant context identifier.');
    }

    const nowIso = new Date().toISOString();

    const caseData: CaseTriageDetailData = {
      caseId,
      tenantId,
      title: 'Suspicious Cloud IAM Privilege Escalation',
      severity: 'HIGH',
      status: 'INVESTIGATING',
      aiSummary: {
        narrative:
          'Identity admin@corp.internal performed abnormal AssumeRole operations from an unmanaged IP across non-business hours.',
        groundedCitations: [
          'ev:entra:sign-in-failed-101',
          'ev:guardduty:unauthorized-api-call',
        ],
        confidenceScore: 0.98,
        fallbackActive: false,
      },
      evidenceCount: 2,
      assignedResponder: 'secops-analyst-bob',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    return {
      status: 'HEALTHY_SYNCED',
      data: caseData,
      isPartial: false,
      isStale: false,
      lastSyncedAt: nowIso,
      correlationId,
      tenantId,
    };
  }

  /**
   * Retrieves continuous assurance evidence freshness metrics.
   */
  async getEvidenceFreshness(
    tenantId: string,
    correlationId: string,
  ): Promise<ExperienceStateEnvelope<EvidenceFreshnessData>> {
    if (!tenantId || tenantId.trim() === '') {
      throw new UnauthorizedException('Missing tenant context identifier.');
    }

    const nowIso = new Date().toISOString();

    const freshnessData: EvidenceFreshnessData = {
      tenantId,
      frameworks: [
        {
          framework: 'SOC 2 (TSC 2017)',
          totalControls: 18,
          compliantControls: 18,
          staleControls: 0,
          averageFreshnessSeconds: 16,
        },
        {
          framework: 'ISO/IEC 27001:2022',
          totalControls: 24,
          compliantControls: 24,
          staleControls: 0,
          averageFreshnessSeconds: 22,
        },
      ],
      overallFreshnessScore: 0.99,
      nextScheduledCheckpointAt: new Date(Date.now() + 300000).toISOString(),
    };

    return {
      status: 'HEALTHY_SYNCED',
      data: freshnessData,
      isPartial: false,
      isStale: false,
      lastSyncedAt: nowIso,
      correlationId,
      tenantId,
    };
  }
}
