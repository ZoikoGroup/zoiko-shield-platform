import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  RegulatoryControlsSeeder,
  RegulatoryControlDefinition,
} from '../../seeds/regulatory-controls.seeder';
import { computeDomainSeparatedMerkleRoot } from '../../common/merkle.util';

export interface ControlEvaluationInput {
  tenantId: string;
  environmentId: string;
  region?: string;
  telemetrySnapshot?: {
    mfaEnforcementRate?: number; // 0.0 to 1.0 (1.0 = 100%)
    edrCoverageRate?: number; // 0.0 to 1.0 (>= 0.99)
    vulnerabilitySlaBreachCount?: number; // e.g. 0
    ocsfPipelineLatencyMs?: number; // e.g. 450ms (< 1000ms)
    keyRotationDaysAgo?: number; // e.g. 45 days (<= 90 days)
    malwareDefinitionsAgeHours?: number; // e.g. 2 hours (<= 24 hours)
    unresolvedHighSeverityThreats?: number; // e.g. 0
    pqcDualSignEnforced?: boolean; // true / false
    disasterRecoveryRtoMinutes?: number; // e.g. 15 minutes (<= 30 minutes)
  };
}

/**
 * NOT_EVALUATED is a first-class outcome, not a failure. A control whose
 * telemetry was never collected has not been shown to pass and has not been
 * shown to fail, and reporting either would be a claim nobody measured.
 */
export type ControlStatus =
  'COMPLIANT' | 'NON_COMPLIANT' | 'GAP_DETECTED' | 'NOT_EVALUATED';

export interface ControlEvaluationResult {
  controlCode: string;
  framework: string;
  title: string;
  status: ControlStatus;
  /** null when the control was not evaluated — a missing measurement is not a score of zero. */
  complianceScore: number | null;
  evidenceDigest: string;
  details: Record<string, any>;
  evaluatedAt: string;
}

export interface FrameworkAssessmentReport {
  assessmentId: string;
  tenantId: string;
  environmentId: string;
  /** Over the controls that were actually evaluated; null when none were. */
  overallComplianceScore: number | null;
  totalControls: number;
  totalControlsEvaluated: number;
  compliantControlsCount: number;
  nonCompliantControlsCount: number;
  notEvaluatedControlsCount: number;
  /** Named so a reader can see which parts of the framework this report says nothing about. */
  notEvaluatedControlCodes: string[];
  evaluations: ControlEvaluationResult[];
  merkleEvidenceRoot: string;
  assessedAt: string;
}

@Injectable()
export class ContinuousControlEvaluatorService {
  private readonly logger = new Logger(ContinuousControlEvaluatorService.name);

  constructor(private readonly controlsSeeder: RegulatoryControlsSeeder) {}

  /**
   * Evaluates the regulatory framework controls for which telemetry was
   * supplied, and reports the rest as NOT_EVALUATED.
   *
   * This used to substitute a hard-coded perfect snapshot whenever telemetry
   * was absent — 100% MFA, 100% EDR coverage, zero SLA breaches, PQC
   * dual-signing on — so calling it with no measurements at all produced a
   * report stating full compliance across every framework, complete with a
   * Merkle root over the invented findings. Nothing in the output showed
   * which figures had been measured and which had been assumed.
   */
  async evaluateFrameworkControls(
    input: ControlEvaluationInput,
  ): Promise<FrameworkAssessmentReport> {
    const controls = this.controlsSeeder.getCanonicalFrameworkControls();
    const evaluations: ControlEvaluationResult[] = [];
    const evidenceHashes: string[] = [];

    const snap = input.telemetrySnapshot ?? {};
    if (!input.telemetrySnapshot) {
      this.logger.warn(
        `No telemetry snapshot supplied for tenant ${input.tenantId} — every control will be reported NOT_EVALUATED rather than assumed compliant.`,
      );
    }

    for (const ctrl of controls) {
      const evalResult = this.evaluateSingleControl(ctrl, snap);
      evaluations.push(evalResult);

      const evidencePayload = JSON.stringify({
        controlCode: ctrl.code,
        status: evalResult.status,
        details: evalResult.details,
      });

      const hash = crypto
        .createHash('sha256')
        .update(evidencePayload)
        .digest('hex');
      evidenceHashes.push(hash);
    }

    const merkleRoot = computeDomainSeparatedMerkleRoot(evidenceHashes);
    const assessed = evaluations.filter((e) => e.status !== 'NOT_EVALUATED');
    const notEvaluated = evaluations.filter(
      (e) => e.status === 'NOT_EVALUATED',
    );
    const compliantCount = assessed.filter(
      (e) => e.status === 'COMPLIANT',
    ).length;

    return {
      assessmentId: `asmt-${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      environmentId: input.environmentId,
      // A score over the controls that were measured. Counting unmeasured
      // controls as passes inflated it; counting them as failures would
      // understate it. Neither is a measurement, so neither is in here.
      overallComplianceScore:
        assessed.length === 0
          ? null
          : Math.round((compliantCount / assessed.length) * 100),
      totalControls: evaluations.length,
      totalControlsEvaluated: assessed.length,
      compliantControlsCount: compliantCount,
      nonCompliantControlsCount: assessed.length - compliantCount,
      notEvaluatedControlsCount: notEvaluated.length,
      notEvaluatedControlCodes: notEvaluated.map((e) => e.controlCode),
      evaluations,
      merkleEvidenceRoot: merkleRoot,
      assessedAt: new Date().toISOString(),
    };
  }

  /**
   * The telemetry each control's rule reads. A control cannot be judged
   * without these, and saying so is the point: the previous version had a
   * catch-all `else` per control that declared compliance whenever the metric
   * was simply absent, plus a `default` branch that certified every control
   * it did not recognise as "verified within tolerance limits".
   */
  private static readonly REQUIRED_METRICS: Record<string, string[]> = {
    'SOC2-CC6.1': ['mfaEnforcementRate'],
    'SOC2-CC6.6': ['edrCoverageRate'],
    'SOC2-CC7.1': ['vulnerabilitySlaBreachCount'],
    'SOC2-CC7.2': ['ocsfPipelineLatencyMs'],
    'ISO27001-A.5.15': ['keyRotationDaysAgo'],
    'ISO27001-A.8.7': ['malwareDefinitionsAgeHours', 'edrCoverageRate'],
    'ISO27001-A.8.16': ['unresolvedHighSeverityThreats'],
    'ISO27001-A.8.24': ['pqcDualSignEnforced'],
    'DORA-ART9': ['disasterRecoveryRtoMinutes'],
    'DORA-ART10': ['unresolvedHighSeverityThreats'],
  };

  private evaluateSingleControl(
    ctrl: RegulatoryControlDefinition,
    snap: Record<string, any>,
  ): ControlEvaluationResult {
    const required =
      ContinuousControlEvaluatorService.REQUIRED_METRICS[ctrl.code];

    const finish = (
      status: ControlStatus,
      complianceScore: number | null,
      details: Record<string, any>,
    ): ControlEvaluationResult => ({
      controlCode: ctrl.code,
      framework: ctrl.framework,
      title: ctrl.title,
      status,
      complianceScore,
      evidenceDigest: crypto
        .createHash('sha256')
        .update(JSON.stringify({ ctrl: ctrl.code, status, details }))
        .digest('hex'),
      details,
      evaluatedAt: new Date().toISOString(),
    });

    // A control with no rule here has never been implemented. It is not
    // passing.
    if (!required) {
      return finish('NOT_EVALUATED', null, {
        reason:
          'No automated evaluation rule is implemented for this control; its posture has not been measured.',
      });
    }

    const missing = required.filter((metric) => snap[metric] === undefined);
    if (missing.length > 0) {
      return finish('NOT_EVALUATED', null, {
        reason: `Not measured: the telemetry snapshot did not include ${missing.join(', ')}.`,
        missingMetrics: missing,
      });
    }

    const details: Record<string, any> = {};

    switch (ctrl.code) {
      case 'SOC2-CC6.1': // Access control and MFA
        if (snap.mfaEnforcementRate < 1.0) {
          return finish('NON_COMPLIANT', snap.mfaEnforcementRate * 100, {
            reason: `MFA is enforced on ${(snap.mfaEnforcementRate * 100).toFixed(1)}% of users (required: 100%)`,
          });
        }
        details.reason = 'MFA enforced on 100% of measured users';
        break;

      case 'SOC2-CC6.6': // Boundary protection and host isolation
        if (snap.edrCoverageRate < 0.99) {
          return finish('NON_COMPLIANT', snap.edrCoverageRate * 100, {
            reason: `EDR coverage is ${(snap.edrCoverageRate * 100).toFixed(1)}% (required: >= 99%)`,
          });
        }
        details.reason = `EDR coverage measured at ${(snap.edrCoverageRate * 100).toFixed(1)}%`;
        break;

      case 'SOC2-CC7.1': // Vulnerability management
        if (snap.vulnerabilitySlaBreachCount > 0) {
          return finish('NON_COMPLIANT', 60.0, {
            reason: `${snap.vulnerabilitySlaBreachCount} open vulnerabilities exceed the SLA remediation timeline`,
          });
        }
        details.reason = 'No vulnerabilities measured as exceeding SLA';
        break;

      case 'SOC2-CC7.2': // Detection telemetry pipeline
        if (snap.ocsfPipelineLatencyMs > 1000) {
          return finish('NON_COMPLIANT', 75.0, {
            reason: `OCSF pipeline latency is ${snap.ocsfPipelineLatencyMs}ms (threshold: <= 1000ms)`,
          });
        }
        details.reason = `OCSF pipeline latency measured at ${snap.ocsfPipelineLatencyMs}ms`;
        break;

      case 'ISO27001-A.5.15': // Key rotation
        if (snap.keyRotationDaysAgo > 90) {
          return finish('NON_COMPLIANT', 50.0, {
            reason: `Master KMS keys last rotated ${snap.keyRotationDaysAgo} days ago (maximum: 90 days)`,
          });
        }
        details.reason = `Master KMS key rotated ${snap.keyRotationDaysAgo} days ago`;
        break;

      case 'ISO27001-A.8.7': // Protection against malware
        if (snap.malwareDefinitionsAgeHours > 24) {
          return finish('NON_COMPLIANT', 55.0, {
            reason: `Malware definitions are ${snap.malwareDefinitionsAgeHours}h old (threshold: <= 24h)`,
          });
        }
        if (snap.edrCoverageRate < 0.99) {
          return finish('NON_COMPLIANT', snap.edrCoverageRate * 100, {
            reason: `Antimalware/EDR coverage is ${(snap.edrCoverageRate * 100).toFixed(1)}% (< 99%)`,
          });
        }
        details.reason = `Definitions ${snap.malwareDefinitionsAgeHours}h old across ${(snap.edrCoverageRate * 100).toFixed(1)}% coverage`;
        break;

      case 'ISO27001-A.8.16': // Monitoring activities
        if (snap.unresolvedHighSeverityThreats > 0) {
          return finish('NON_COMPLIANT', 70.0, {
            reason: `${snap.unresolvedHighSeverityThreats} unresolved critical/high anomalies pending review`,
          });
        }
        details.reason = 'No unresolved critical/high anomalies measured';
        break;

      case 'ISO27001-A.8.24': // Cryptography
        if (snap.pqcDualSignEnforced === false) {
          return finish('NON_COMPLIANT', 40.0, {
            reason: 'Post-quantum dual-signing is disabled',
          });
        }
        details.reason = 'Post-quantum dual-signing reported as enforced';
        break;

      case 'DORA-ART9': // ICT risk management and recovery
        if (snap.disasterRecoveryRtoMinutes > 30) {
          return finish('GAP_DETECTED', 65.0, {
            reason: `Measured failover RTO was ${snap.disasterRecoveryRtoMinutes} minutes (threshold: <= 30 minutes)`,
          });
        }
        details.reason = `Measured failover RTO of ${snap.disasterRecoveryRtoMinutes} minutes`;
        break;

      case 'DORA-ART10': // Prompt incident detection
        if (snap.unresolvedHighSeverityThreats > 0) {
          return finish('GAP_DETECTED', 60.0, {
            reason: `${snap.unresolvedHighSeverityThreats} findings exceed the prompt detection SLA`,
          });
        }
        details.reason = 'No findings measured as exceeding the detection SLA';
        break;
    }

    return finish('COMPLIANT', 100.0, details);
  }
}
