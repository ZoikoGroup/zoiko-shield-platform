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
  severity: 'NORMAL' | 'WARNING' | 'CRITICAL_SLA_BREACH' | 'NOT_ASSESSABLE';
  /** null when the report it came from measured nothing. */
  baselineScore: number | null;
  currentScore: number | null;
  driftPercentage: number | null;
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
    const currentScore = report.overallComplianceScore;

    // A report in which nothing was measured cannot drift from anything. It
    // is neither a breach nor an all-clear, and it must not overwrite a
    // baseline that was measured.
    const notAssessable = currentScore === null;

    const baseline = this.frameworkBaselines.get(key) ?? currentScore;
    if (!this.frameworkBaselines.has(key) && currentScore !== null) {
      this.frameworkBaselines.set(key, currentScore);
    }

    const driftPercentage =
      baseline !== null && currentScore !== null && baseline > 0
        ? ((baseline - currentScore) / baseline) * 100
        : null;

    // Degraded controls only. A NOT_EVALUATED control has not drifted from
    // compliant — nobody established it was compliant to begin with.
    const driftedControls = report.evaluations
      .filter((e) => e.status !== 'COMPLIANT' && e.status !== 'NOT_EVALUATED')
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
    let severity: ComplianceDriftRecord['severity'] = 'NORMAL';
    if (notAssessable) {
      severity = 'NOT_ASSESSABLE';
    } else if (
      currentScore! < slaThreshold ||
      driftedControls.length >= 3 ||
      staleEvidenceControls.length >= 2
    ) {
      severity = 'CRITICAL_SLA_BREACH';
    } else if (
      (baseline !== null && currentScore! < baseline) ||
      driftedControls.length > 0 ||
      staleEvidenceControls.length > 0
    ) {
      severity = 'WARNING';
    }

    let recommendation =
      'Every measured control passed and the score is within the agreed SLA threshold.';
    if (severity === 'NOT_ASSESSABLE') {
      recommendation = `No control was evaluated (${report.notEvaluatedControlsCount} of ${report.totalControls} lack telemetry), so compliance drift cannot be determined. Supply a telemetry snapshot before reading this as a posture.`;
    } else if (severity === 'CRITICAL_SLA_BREACH') {
      recommendation = `Immediate remediation required: Compliance score (${currentScore}%) dropped below contractual threshold (${slaThreshold}%). Prioritize: ${driftedControls.map((d) => d.controlCode).join(', ')}`;
    } else if (severity === 'WARNING') {
      recommendation = `Investigate minor compliance drift (${driftPercentage?.toFixed(1) ?? 'unknown'}% reduction). Verify telemetry freshness and remediation tickets.`;
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
      driftPercentage:
        driftPercentage === null
          ? null
          : Math.max(0, parseFloat(driftPercentage.toFixed(2))),
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
