import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  FrameworkAssessmentReport,
  ControlEvaluationResult,
} from './continuous-control-evaluator.service';

export interface ComplianceDriftRecord {
  driftId: string;
  tenantId: string;
  environmentId: string;
  framework: string;
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL_SLA_BREACH';
  baselineScore: number;
  currentScore: number;
  driftPercentage: number;
  driftedControls: Array<{
    controlCode: string;
    previousStatus: string;
    currentStatus: string;
    reason: string;
  }>;
  staleEvidenceControls: string[];
  recommendation: string;
  evidenceDigest: string;
  detectedAt: Date;
}

export interface EvidenceFreshnessInput {
  tenantId: string;
  controlCode: string;
  lastEvidenceTimestamp: Date;
  maxFreshnessSeconds: number;
}

@Injectable()
export class ComplianceDriftDetectorService {
  private readonly logger = new Logger(ComplianceDriftDetectorService.name);

  // In-memory historical baselines: tenantId:environmentId -> baseline score
  private readonly frameworkBaselines = new Map<string, number>();

  // Drift incident history: tenantId -> list of drift records
  private readonly driftHistory = new Map<string, ComplianceDriftRecord[]>();

  /**
   * Evaluates an assessment report against historical baselines and freshness constraints.
   */
  detectDrift(
    report: FrameworkAssessmentReport,
    options?: {
      targetSlaThreshold?: number; // default 90.0%
      freshnessChecks?: EvidenceFreshnessInput[];
    },
  ): ComplianceDriftRecord {
    const slaThreshold = options?.targetSlaThreshold ?? 90.0;
    const key = `${report.tenantId}:${report.environmentId}`;
    const baseline =
      this.frameworkBaselines.get(key) ?? report.overallComplianceScore;

    // Record baseline if not set
    if (!this.frameworkBaselines.has(key)) {
      this.frameworkBaselines.set(key, report.overallComplianceScore);
    }

    const currentScore = report.overallComplianceScore;
    const driftPercentage =
      baseline > 0 ? ((baseline - currentScore) / baseline) * 100 : 0;

    // Detect degraded controls
    const driftedControls = report.evaluations
      .filter((e) => e.status !== 'COMPLIANT')
      .map((e) => ({
        controlCode: e.controlCode,
        previousStatus: 'COMPLIANT',
        currentStatus: e.status,
        reason:
          e.details?.reason ||
          'Non-compliance detected against current telemetry',
      }));

    // Detect stale evidence
    const staleEvidenceControls: string[] = [];
    if (options?.freshnessChecks) {
      const now = Date.now();
      for (const check of options.freshnessChecks) {
        const ageSec = (now - check.lastEvidenceTimestamp.getTime()) / 1000;
        if (ageSec > check.maxFreshnessSeconds) {
          staleEvidenceControls.push(check.controlCode);
        }
      }
    }

    // Determine severity
    let severity: 'NORMAL' | 'WARNING' | 'CRITICAL_SLA_BREACH' = 'NORMAL';
    if (
      currentScore < slaThreshold ||
      driftedControls.length >= 3 ||
      staleEvidenceControls.length >= 2
    ) {
      severity = 'CRITICAL_SLA_BREACH';
    } else if (
      currentScore < baseline ||
      driftedControls.length > 0 ||
      staleEvidenceControls.length > 0
    ) {
      severity = 'WARNING';
    }

    let recommendation =
      'Posture is compliant and aligned with established SLA thresholds.';
    if (severity === 'CRITICAL_SLA_BREACH') {
      recommendation = `Immediate remediation required: Compliance score (${currentScore}%) dropped below contractual threshold (${slaThreshold}%). Prioritize: ${driftedControls.map((d) => d.controlCode).join(', ')}`;
    } else if (severity === 'WARNING') {
      recommendation = `Investigate minor compliance drift (${driftPercentage.toFixed(1)}% reduction). Verify telemetry freshness and remediation tickets.`;
    }

    const driftId = `drift-${crypto.randomUUID()}`;
    const evidencePayload = JSON.stringify({
      driftId,
      tenantId: report.tenantId,
      currentScore,
      driftedControls,
      staleEvidenceControls,
      evaluatedAt: report.assessedAt,
    });
    const evidenceDigest = crypto
      .createHash('sha256')
      .update(evidencePayload)
      .digest('hex');

    const driftRecord: ComplianceDriftRecord = {
      driftId,
      tenantId: report.tenantId,
      environmentId: report.environmentId,
      framework: 'MULTI_FRAMEWORK',
      severity,
      baselineScore: baseline,
      currentScore,
      driftPercentage: Math.max(0, parseFloat(driftPercentage.toFixed(2))),
      driftedControls,
      staleEvidenceControls,
      recommendation,
      evidenceDigest,
      detectedAt: new Date(),
    };

    const history = this.driftHistory.get(report.tenantId) ?? [];
    history.push(driftRecord);
    this.driftHistory.set(report.tenantId, history);

    if (severity !== 'NORMAL') {
      this.logger.warn(
        `🚨 [COMPLIANCE DRIFT DETECTED] Tenant: ${report.tenantId} | Severity: ${severity} | Score: ${currentScore}% (Baseline: ${baseline}%)`,
      );
    }

    return driftRecord;
  }

  /**
   * Retrieves drift incident history for a tenant.
   */
  getDriftHistory(tenantId: string): ComplianceDriftRecord[] {
    return this.driftHistory.get(tenantId) ?? [];
  }

  /**
   * Resets tenant baseline for periodic re-certifications.
   */
  setBaseline(
    tenantId: string,
    environmentId: string,
    baselineScore: number,
  ): void {
    this.frameworkBaselines.set(`${tenantId}:${environmentId}`, baselineScore);
  }

  /**
   * Clears state for clean test executions.
   */
  clearState(): void {
    this.frameworkBaselines.clear();
    this.driftHistory.clear();
  }
}
