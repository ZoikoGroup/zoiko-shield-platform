import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface IngestionMetrics {
  tenantId: string;
  acceptanceRatePercentage: number;
  lagMs: number;
  normalizationSuccessPercentage: number;
  quarantineCount: number;
  connectorState: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
}

export interface DetectionMetrics {
  tenantId: string;
  p99LatencyMs: number;
  replayDeterminismPercentage: number;
  falsePositiveReviewRate: number;
  stateStoreHealth: 'OPTIMAL' | 'DEGRADED';
}

export interface CaseResponseMetrics {
  tenantId: string;
  alertToTriageAvgSeconds: number;
  caseAgeHours: number;
  approvalLatencySeconds: number;
  executedActionsCount: number;
  rollbackActionsCount: number;
}

export interface EvidenceMetrics {
  tenantId: string;
  freshnessSeconds: number;
  completenessPercentage: number;
  ledgerVerifiedCount: number;
  anchorPublicationLatencyMs: number;
}

export interface AiGatewayMetrics {
  tenantId: string;
  modelVersion: string;
  avgGroundingScore: number; // 0.0 - 1.0
  citationValidityPercentage: number;
  blockedVerdictsCount: number;
  totalTokensUsed: number;
  tenantAttributableCostUsd: number;
}

export interface PlatformSloSnapshot {
  snapshotId: string;
  timestamp: string;
  ingestion: IngestionMetrics;
  detection: DetectionMetrics;
  caseResponse: CaseResponseMetrics;
  evidence: EvidenceMetrics;
  aiGateway: AiGatewayMetrics;
  promQlFormattedMetrics: string[];
  attestationDigest: string;
}

/**
 * OpenTelemetry & PromQL SLO Metrics Exporter
 * Specification: Backend Build Guide §LAB 16 (Observability, SLOs & Operational Readiness)
 */
@Injectable()
export class SloMetricsExporterService {
  private readonly logger = new Logger(SloMetricsExporterService.name);

  /**
   * Aggregates multi-dimensional telemetry into compliant PromQL exposition format.
   */
  generateSloMetricsSnapshot(
    tenantId: string,
    signals: {
      ingestion: IngestionMetrics;
      detection: DetectionMetrics;
      caseResponse: CaseResponseMetrics;
      evidence: EvidenceMetrics;
      aiGateway: AiGatewayMetrics;
    },
  ): PlatformSloSnapshot {
    const snapshotId = `slo-snap-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    const promQlFormattedMetrics: string[] = [
      `# HELP zoikoshield_ingest_acceptance_rate Ingestion acceptance percentage`,
      `# TYPE zoikoshield_ingest_acceptance_rate gauge`,
      `zoikoshield_ingest_acceptance_rate{tenant_id="${tenantId}",connector_state="${signals.ingestion.connectorState}"} ${signals.ingestion.acceptanceRatePercentage.toFixed(2)}`,

      `# HELP zoikoshield_ingest_lag_ms Ingestion pipeline lag in milliseconds`,
      `# TYPE zoikoshield_ingest_lag_ms gauge`,
      `zoikoshield_ingest_lag_ms{tenant_id="${tenantId}"} ${signals.ingestion.lagMs}`,

      `# HELP zoikoshield_detection_p99_latency_ms Detection p99 latency in milliseconds`,
      `# TYPE zoikoshield_detection_p99_latency_ms gauge`,
      `zoikoshield_detection_p99_latency_ms{tenant_id="${tenantId}"} ${signals.detection.p99LatencyMs}`,

      `# HELP zoikoshield_evidence_freshness_seconds Evidence collection freshness in seconds`,
      `# TYPE zoikoshield_evidence_freshness_seconds gauge`,
      `zoikoshield_evidence_freshness_seconds{tenant_id="${tenantId}"} ${signals.evidence.freshnessSeconds}`,

      `# HELP zoikoshield_evidence_completeness_percentage Evidence completeness percentage`,
      `# TYPE zoikoshield_evidence_completeness_percentage gauge`,
      `zoikoshield_evidence_completeness_percentage{tenant_id="${tenantId}"} ${signals.evidence.completenessPercentage.toFixed(1)}`,

      `# HELP zoikoshield_ai_grounding_score Average AI grounding score (0 to 1)`,
      `# TYPE zoikoshield_ai_grounding_score gauge`,
      `zoikoshield_ai_grounding_score{tenant_id="${tenantId}",model="${signals.aiGateway.modelVersion}"} ${signals.aiGateway.avgGroundingScore.toFixed(3)}`,

      `# HELP zoikoshield_tenant_cost_usd Tenant attributable cloud and AI cost in USD`,
      `# TYPE zoikoshield_tenant_cost_usd counter`,
      `zoikoshield_tenant_cost_usd{tenant_id="${tenantId}"} ${signals.aiGateway.tenantAttributableCostUsd.toFixed(4)}`,
    ];

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          snapshotId,
          tenantId,
          timestamp,
          promQlFormattedMetrics,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Generated LAB 16 SLO Metrics Snapshot for Tenant '${tenantId}' (${promQlFormattedMetrics.length} PromQL metrics)`,
    );

    return {
      snapshotId,
      timestamp,
      ingestion: signals.ingestion,
      detection: signals.detection,
      caseResponse: signals.caseResponse,
      evidence: signals.evidence,
      aiGateway: signals.aiGateway,
      promQlFormattedMetrics,
      attestationDigest,
    };
  }
}
