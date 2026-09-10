/**
 * Experience State Contract Interfaces
 * Specification: MASTER_BUILD_PLAN.md §7 Step 8 (Experience-Facing APIs / LAB 14)
 *
 * Mandate:
 * "Every API exposes explicit loading, partial, stale, degraded, unauthorized, unavailable, and recovery states."
 */

export type ExperienceStateStatus =
  | 'LOADING'
  | 'PARTIAL'
  | 'STALE'
  | 'DEGRADED'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'RECOVERY_IN_PROGRESS'
  | 'HEALTHY_SYNCED';

export interface ExperienceStateEnvelope<T> {
  status: ExperienceStateStatus;
  data?: T;
  isPartial: boolean;
  isStale: boolean;
  staleGracePeriodSeconds?: number;
  degradedReason?: string;
  recoveryEstimateMs?: number;
  lastSyncedAt: string;
  correlationId: string;
  tenantId: string;
}

export interface CommandCenterOverviewData {
  tenantId: string;
  securityScore: number;
  compliancePosturePct: number;
  activeIncidentsCount: number;
  unresolvedAlertsCount: number;
  freshnessStatus: 'FRESH' | 'WARNING' | 'CRITICAL_STALE';
  monitoredAssetsCount: number;
  regionalCell: string;
  lastTelemetryTimestamp: string;
}

export interface CaseTriageDetailData {
  caseId: string;
  tenantId: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status:
    'OPEN' | 'INVESTIGATING' | 'CONTAINMENT_PROPOSED' | 'RESOLVED' | 'CLOSED';
  aiSummary: {
    narrative: string;
    groundedCitations: string[];
    confidenceScore: number;
    fallbackActive: boolean;
  };
  evidenceCount: number;
  assignedResponder?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceFreshnessData {
  tenantId: string;
  frameworks: Array<{
    framework: string;
    totalControls: number;
    compliantControls: number;
    staleControls: number;
    averageFreshnessSeconds: number;
  }>;
  overallFreshnessScore: number;
  nextScheduledCheckpointAt: string;
}
