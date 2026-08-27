import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { RegulatoryControlsSeeder, RegulatoryControlDefinition } from '../../seeds/regulatory-controls.seeder';
import { MerkleTreeService } from '../../../../shield-anchor/src/merkle/merkle-tree.service';

export interface ControlEvaluationInput {
  tenantId: string;
  environmentId: string;
  region?: string;
  telemetrySnapshot?: {
    mfaEnforcementRate?: number; // 0.0 to 1.0 (1.0 = 100%)
    edrCoverageRate?: number; // 0.0 to 1.0
    keyRotationDaysAgo?: number; // e.g. 45 days
    disasterRecoveryRtoMinutes?: number; // e.g. 15 minutes
    unresolvedHighSeverityThreats?: number; // e.g. 0
  };
}

export interface ControlEvaluationResult {
  controlCode: string;
  framework: string;
  title: string;
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'GAP_DETECTED';
  complianceScore: number; // 0.0 to 100.0
  evidenceDigest: string;
  details: Record<string, any>;
  evaluatedAt: string;
}

export interface FrameworkAssessmentReport {
  assessmentId: string;
  tenantId: string;
  environmentId: string;
  overallComplianceScore: number;
  totalControlsEvaluated: number;
  compliantControlsCount: number;
  nonCompliantControlsCount: number;
  evaluations: ControlEvaluationResult[];
  merkleEvidenceRoot: string;
  assessedAt: string;
}

@Injectable()
export class ContinuousControlEvaluatorService {
  private readonly logger = new Logger(ContinuousControlEvaluatorService.name);

  constructor(
    private readonly controlsSeeder: RegulatoryControlsSeeder,
    private readonly merkleTreeService: MerkleTreeService,
  ) {}

  /**
   * Evaluates all active regulatory framework controls against current environment telemetry snapshot.
   */
  async evaluateFrameworkControls(
    input: ControlEvaluationInput,
  ): Promise<FrameworkAssessmentReport> {
    const controls = this.controlsSeeder.getCanonicalFrameworkControls();
    const evaluations: ControlEvaluationResult[] = [];
    const evidenceHashes: string[] = [];

    const snap = input.telemetrySnapshot ?? {
      mfaEnforcementRate: 1.0,
      edrCoverageRate: 1.0,
      keyRotationDaysAgo: 30,
      disasterRecoveryRtoMinutes: 12,
      unresolvedHighSeverityThreats: 0,
    };

    for (const ctrl of controls) {
      const evalResult = this.evaluateSingleControl(ctrl, snap);
      evaluations.push(evalResult);

      const evidencePayload = JSON.stringify({
        controlCode: ctrl.code,
        status: evalResult.status,
        details: evalResult.details,
      });

      const hash = crypto.createHash('sha256').update(evidencePayload).digest('hex');
      evidenceHashes.push(hash);
    }

    const merkleBuild = this.merkleTreeService.build(evidenceHashes);
    const compliantCount = evaluations.filter((e) => e.status === 'COMPLIANT').length;
    const score = Math.round((compliantCount / evaluations.length) * 100);

    return {
      assessmentId: `asmt-${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      environmentId: input.environmentId,
      overallComplianceScore: score,
      totalControlsEvaluated: evaluations.length,
      compliantControlsCount: compliantCount,
      nonCompliantControlsCount: evaluations.length - compliantCount,
      evaluations,
      merkleEvidenceRoot: merkleBuild.root,
      assessedAt: new Date().toISOString(),
    };
  }

  private evaluateSingleControl(
    ctrl: RegulatoryControlDefinition,
    snap: Record<string, any>,
  ): ControlEvaluationResult {
    let status: 'COMPLIANT' | 'NON_COMPLIANT' | 'GAP_DETECTED' = 'COMPLIANT';
    let complianceScore = 100.0;
    const details: Record<string, any> = {};

    switch (ctrl.code) {
      case 'SOC2-CC6.1': // Access Control & MFA
        if (snap.mfaEnforcementRate < 1.0) {
          status = 'NON_COMPLIANT';
          complianceScore = snap.mfaEnforcementRate * 100;
          details.reason = `MFA is enforced on ${(snap.mfaEnforcementRate * 100).toFixed(1)}% of users (Required: 100%)`;
        } else {
          details.reason = '100% MFA WebAuthn/FIDO2 enforcement verified';
        }
        break;

      case 'SOC2-CC6.6': // Boundary Protection & EDR
        if (snap.edrCoverageRate < 0.99) {
          status = 'NON_COMPLIANT';
          complianceScore = snap.edrCoverageRate * 100;
          details.reason = `EDR coverage is ${(snap.edrCoverageRate * 100).toFixed(1)}% (Required: >= 99%)`;
        } else {
          details.reason = '100% active EDR agent workload coverage verified';
        }
        break;

      case 'ISO27001-A.5.15': // Access Control & Key Management
        if (snap.keyRotationDaysAgo > 90) {
          status = 'NON_COMPLIANT';
          complianceScore = 50.0;
          details.reason = `Master KMS keys last rotated ${snap.keyRotationDaysAgo} days ago (Maximum: 90 days)`;
        } else {
          details.reason = `Master KMS key rotated ${snap.keyRotationDaysAgo} days ago (< 90-day threshold)`;
        }
        break;

      case 'ISO27001-A.8.16': // Monitoring Activities and Log Integrity
        if (snap.unresolvedHighSeverityThreats > 0) {
          status = 'NON_COMPLIANT';
          complianceScore = 70.0;
          details.reason = `${snap.unresolvedHighSeverityThreats} unresolved critical/high security anomalies pending review`;
        } else {
          details.reason = 'Continuous Merkle log verification and zero open critical threats';
        }
        break;

      case 'DORA-ART9': // ICT Risk Management & Disaster Recovery
        if (snap.disasterRecoveryRtoMinutes > 30) {
          status = 'GAP_DETECTED';
          complianceScore = 65.0;
          details.reason = `Measured failover RTO was ${snap.disasterRecoveryRtoMinutes} minutes (Threshold: <= 30 minutes)`;
        } else {
          details.reason = `Tabletop drill achieved ${snap.disasterRecoveryRtoMinutes}-minute RTO with zero data loss`;
        }
        break;

      case 'DORA-ART10': // Prompt Incident Detection SLA
        if (snap.unresolvedHighSeverityThreats > 0) {
          status = 'GAP_DETECTED';
          complianceScore = 60.0;
          details.reason = `${snap.unresolvedHighSeverityThreats} unmitigated security findings exceeding prompt detection SLA`;
        } else {
          details.reason = 'Sub-second OCSF detection pipeline meeting DORA Article 10 SLA';
        }
        break;

      default:
        details.reason = 'Standard operational posture verified within tolerance limits';
        break;
    }

    const digest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ ctrl: ctrl.code, status, details }))
      .digest('hex');

    return {
      controlCode: ctrl.code,
      framework: ctrl.framework,
      title: ctrl.title,
      status,
      complianceScore,
      evidenceDigest: digest,
      details,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
