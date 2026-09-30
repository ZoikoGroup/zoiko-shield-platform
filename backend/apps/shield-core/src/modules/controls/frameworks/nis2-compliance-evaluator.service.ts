import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { computeDomainSeparatedMerkleRoot } from '../../../common/merkle.util';

export interface Nis2TelemetrySnapshot {
  entityType?: 'ESSENTIAL_ENTITY' | 'IMPORTANT_ENTITY';
  incidentHandlingProcessDocumented?: boolean;
  businessContinuityTestedDaysAgo?: number; // Target: <= 180 days
  sbomAttestationCoverageRate?: number; // Target: 1.0 (100%)
  vulnerabilityDisclosurePolicyActive?: boolean;
  effectivenessAuditPassed?: boolean;
  pqcAndKmsEncryptionEnforced?: boolean;
  mfaEnforcementRate?: number; // Target: 1.0 (100%)
  unreportedIncidentAgeHours?: number; // Target: <= 24h early warning, <= 72h incident notification
}

export interface Nis2ControlEvaluation {
  article: string;
  controlCode: string;
  title: string;
  domain: string;
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'GAP_DETECTED' | 'NOT_EVALUATED';
  complianceScore: number | null;
  evidenceDigest: string;
  details: Record<string, unknown>;
  evaluatedAt: string;
}

export interface Nis2AssessmentReport {
  assessmentId: string;
  framework: 'NIS2_DIRECTIVE_EU_2022_2555';
  entityType: 'ESSENTIAL_ENTITY' | 'IMPORTANT_ENTITY';
  tenantId: string;
  environmentId: string;
  overallComplianceScore: number | null;
  totalControlsEvaluated: number;
  compliantCount: number;
  gapCount: number;
  notEvaluatedCount: number;
  incidentNotificationStatus: {
    withinEarlyWarning24hWindow: boolean;
    withinIncidentNotification72hWindow: boolean;
    earlyWarningDeadlineHours: 24;
    incidentNotificationDeadlineHours: 72;
    finalReportDeadlineDays: 30;
  };
  evaluations: Nis2ControlEvaluation[];
  merkleEvidenceRoot: string;
  evaluatedAt: string;
}

@Injectable()
export class Nis2ComplianceEvaluatorService {
  private readonly logger = new Logger(Nis2ComplianceEvaluatorService.name);

  /**
   * Evaluates essential/important entity cybersecurity posture against NIS2 (EU 2022/2555).
   * Key Articles:
   * - Art. 21(2)(a): Incident handling & risk analysis
   * - Art. 21(2)(b): Business continuity & disaster recovery
   * - Art. 21(2)(c): Supply chain security & SBOM verification
   * - Art. 21(2)(d): Vulnerability handling and disclosure
   * - Art. 21(2)(e): Effectiveness assessment policies
   * - Art. 21(2)(f): Cryptography & Post-Quantum dual-signing
   * - Art. 21(2)(h): Multi-factor authentication (MFA)
   * - Art. 23: 24-hour Early Warning & 72-hour Incident Notification
   */
  evaluateNis2Posture(
    tenantId: string,
    environmentId: string,
    telemetry?: Nis2TelemetrySnapshot,
  ): Nis2AssessmentReport {
    const assessmentId = `nis2-eval-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();
    const snap = telemetry ?? {};
    const entityType = snap.entityType ?? 'ESSENTIAL_ENTITY';
    const evaluations: Nis2ControlEvaluation[] = [];
    const evidenceHashes: string[] = [];

    // Art. 21(2)(a): Incident Handling
    const art21a = this.evaluateArt21a(snap);
    evaluations.push(art21a);
    evidenceHashes.push(this.hashEvidence('NIS2-ART21-2A', art21a));

    // Art. 21(2)(b): Business Continuity & DR
    const art21b = this.evaluateArt21b(snap);
    evaluations.push(art21b);
    evidenceHashes.push(this.hashEvidence('NIS2-ART21-2B', art21b));

    // Art. 21(2)(c): Supply Chain Security
    const art21c = this.evaluateArt21c(snap);
    evaluations.push(art21c);
    evidenceHashes.push(this.hashEvidence('NIS2-ART21-2C', art21c));

    // Art. 21(2)(d): Vulnerability Disclosure
    const art21d = this.evaluateArt21d(snap);
    evaluations.push(art21d);
    evidenceHashes.push(this.hashEvidence('NIS2-ART21-2D', art21d));

    // Art. 21(2)(e): Effectiveness Assessment
    const art21e = this.evaluateArt21e(snap);
    evaluations.push(art21e);
    evidenceHashes.push(this.hashEvidence('NIS2-ART21-2E', art21e));

    // Art. 21(2)(f): Cryptography & Dual Signing
    const art21f = this.evaluateArt21f(snap);
    evaluations.push(art21f);
    evidenceHashes.push(this.hashEvidence('NIS2-ART21-2F', art21f));

    // Art. 21(2)(h): Multi-Factor Authentication
    const art21h = this.evaluateArt21h(snap);
    evaluations.push(art21h);
    evidenceHashes.push(this.hashEvidence('NIS2-ART21-2H', art21h));

    // Art. 23: Reporting Obligations (24h early warning, 72h notification)
    const art23 = this.evaluateArt23(snap);
    evaluations.push(art23);
    evidenceHashes.push(this.hashEvidence('NIS2-ART23', art23));

    const evaluatedControls = evaluations.filter(
      (e) => e.status !== 'NOT_EVALUATED' && e.complianceScore !== null,
    );
    const overallScore =
      evaluatedControls.length > 0
        ? Math.round(
            evaluatedControls.reduce(
              (acc, curr) => acc + (curr.complianceScore ?? 0),
              0,
            ) / evaluatedControls.length,
          )
        : null;

    const merkleEvidenceRoot = computeDomainSeparatedMerkleRoot(evidenceHashes);

    const withinEarlyWarning =
      snap.unreportedIncidentAgeHours !== undefined
        ? snap.unreportedIncidentAgeHours <= 24
        : true;
    const withinNotification =
      snap.unreportedIncidentAgeHours !== undefined
        ? snap.unreportedIncidentAgeHours <= 72
        : true;

    return {
      assessmentId,
      framework: 'NIS2_DIRECTIVE_EU_2022_2555',
      entityType,
      tenantId,
      environmentId,
      overallComplianceScore: overallScore,
      totalControlsEvaluated: evaluations.length,
      compliantCount: evaluations.filter((e) => e.status === 'COMPLIANT')
        .length,
      gapCount: evaluations.filter(
        (e) => e.status === 'NON_COMPLIANT' || e.status === 'GAP_DETECTED',
      ).length,
      notEvaluatedCount: evaluations.filter((e) => e.status === 'NOT_EVALUATED')
        .length,
      incidentNotificationStatus: {
        withinEarlyWarning24hWindow: withinEarlyWarning,
        withinIncidentNotification72hWindow: withinNotification,
        earlyWarningDeadlineHours: 24,
        incidentNotificationDeadlineHours: 72,
        finalReportDeadlineDays: 30,
      },
      evaluations,
      merkleEvidenceRoot,
      evaluatedAt,
    };
  }

  private hashEvidence(code: string, payload: unknown): string {
    return crypto
      .createHash('sha256')
      .update(`${code}:${JSON.stringify(payload)}`)
      .digest('hex');
  }

  private evaluateArt21a(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.incidentHandlingProcessDocumented === undefined) {
      return {
        article: 'Article 21(2)(a)',
        controlCode: 'NIS2-ART21-2A',
        title: 'Incident Handling & Risk Analysis Policies',
        domain: 'Governance & Incident Handling',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing incident handling documentation status' },
        evaluatedAt,
      };
    }
    return {
      article: 'Article 21(2)(a)',
      controlCode: 'NIS2-ART21-2A',
      title: 'Incident Handling & Risk Analysis Policies',
      domain: 'Governance & Incident Handling',
      status: snap.incidentHandlingProcessDocumented
        ? 'COMPLIANT'
        : 'NON_COMPLIANT',
      complianceScore: snap.incidentHandlingProcessDocumented ? 100 : 0,
      evidenceDigest: `INCIDENT_POLICY_ACTIVE:${snap.incidentHandlingProcessDocumented}`,
      details: { documented: snap.incidentHandlingProcessDocumented },
      evaluatedAt,
    };
  }

  private evaluateArt21b(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.businessContinuityTestedDaysAgo === undefined) {
      return {
        article: 'Article 21(2)(b)',
        controlCode: 'NIS2-ART21-2B',
        title: 'Business Continuity & Disaster Recovery Management',
        domain: 'Operational Continuity',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing BC/DR test cadence' },
        evaluatedAt,
      };
    }
    const compliant = snap.businessContinuityTestedDaysAgo <= 180;
    return {
      article: 'Article 21(2)(b)',
      controlCode: 'NIS2-ART21-2B',
      title: 'Business Continuity & Disaster Recovery Management',
      domain: 'Operational Continuity',
      status: compliant ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: compliant
        ? 100
        : Math.max(0, 100 - (snap.businessContinuityTestedDaysAgo - 180)),
      evidenceDigest: `BC_TESTED_DAYS_AGO:${snap.businessContinuityTestedDaysAgo}`,
      details: {
        testedDaysAgo: snap.businessContinuityTestedDaysAgo,
        maxCadenceDays: 180,
      },
      evaluatedAt,
    };
  }

  private evaluateArt21c(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.sbomAttestationCoverageRate === undefined) {
      return {
        article: 'Article 21(2)(c)',
        controlCode: 'NIS2-ART21-2C',
        title: 'Supply Chain Security & In-Cluster SBOM Attestation',
        domain: 'Supply Chain Assurance',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing SBOM attestation coverage measurement' },
        evaluatedAt,
      };
    }
    const compliant = snap.sbomAttestationCoverageRate === 1.0;
    return {
      article: 'Article 21(2)(c)',
      controlCode: 'NIS2-ART21-2C',
      title: 'Supply Chain Security & In-Cluster SBOM Attestation',
      domain: 'Supply Chain Assurance',
      status: compliant ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: Math.round(snap.sbomAttestationCoverageRate * 100),
      evidenceDigest: `SBOM_COVERAGE:${snap.sbomAttestationCoverageRate}`,
      details: {
        coverageRate: snap.sbomAttestationCoverageRate,
        targetRate: 1.0,
      },
      evaluatedAt,
    };
  }

  private evaluateArt21d(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.vulnerabilityDisclosurePolicyActive === undefined) {
      return {
        article: 'Article 21(2)(d)',
        controlCode: 'NIS2-ART21-2D',
        title: 'Vulnerability Handling & Coordinated Disclosure',
        domain: 'Vulnerability Management',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing vulnerability disclosure policy status' },
        evaluatedAt,
      };
    }
    return {
      article: 'Article 21(2)(d)',
      controlCode: 'NIS2-ART21-2D',
      title: 'Vulnerability Handling & Coordinated Disclosure',
      domain: 'Vulnerability Management',
      status: snap.vulnerabilityDisclosurePolicyActive
        ? 'COMPLIANT'
        : 'NON_COMPLIANT',
      complianceScore: snap.vulnerabilityDisclosurePolicyActive ? 100 : 0,
      evidenceDigest: `VULN_POLICY_ACTIVE:${snap.vulnerabilityDisclosurePolicyActive}`,
      details: { active: snap.vulnerabilityDisclosurePolicyActive },
      evaluatedAt,
    };
  }

  private evaluateArt21e(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.effectivenessAuditPassed === undefined) {
      return {
        article: 'Article 21(2)(e)',
        controlCode: 'NIS2-ART21-2E',
        title: 'Policies to Assess Effectiveness of Risk Measures',
        domain: 'Internal Assurance',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing internal effectiveness audit status' },
        evaluatedAt,
      };
    }
    return {
      article: 'Article 21(2)(e)',
      controlCode: 'NIS2-ART21-2E',
      title: 'Policies to Assess Effectiveness of Risk Measures',
      domain: 'Internal Assurance',
      status: snap.effectivenessAuditPassed ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: snap.effectivenessAuditPassed ? 100 : 40,
      evidenceDigest: `EFFECTIVENESS_AUDIT_PASSED:${snap.effectivenessAuditPassed}`,
      details: { passed: snap.effectivenessAuditPassed },
      evaluatedAt,
    };
  }

  private evaluateArt21f(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.pqcAndKmsEncryptionEnforced === undefined) {
      return {
        article: 'Article 21(2)(f)',
        controlCode: 'NIS2-ART21-2F',
        title: 'Use of Cryptography, Dual-Signing & Cloud KMS',
        domain: 'Cryptographic Protection',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing cryptography enforcement metrics' },
        evaluatedAt,
      };
    }
    return {
      article: 'Article 21(2)(f)',
      controlCode: 'NIS2-ART21-2F',
      title: 'Use of Cryptography, Dual-Signing & Cloud KMS',
      domain: 'Cryptographic Protection',
      status: snap.pqcAndKmsEncryptionEnforced ? 'COMPLIANT' : 'NON_COMPLIANT',
      complianceScore: snap.pqcAndKmsEncryptionEnforced ? 100 : 30,
      evidenceDigest: `PQC_KMS_ENFORCED:${snap.pqcAndKmsEncryptionEnforced}`,
      details: { enforced: snap.pqcAndKmsEncryptionEnforced },
      evaluatedAt,
    };
  }

  private evaluateArt21h(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.mfaEnforcementRate === undefined) {
      return {
        article: 'Article 21(2)(h)',
        controlCode: 'NIS2-ART21-2H',
        title: 'Multi-Factor Authentication (MFA) & Secure Channels',
        domain: 'Authentication & Access Control',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing MFA rate measurement' },
        evaluatedAt,
      };
    }
    const compliant = snap.mfaEnforcementRate >= 0.99;
    return {
      article: 'Article 21(2)(h)',
      controlCode: 'NIS2-ART21-2H',
      title: 'Multi-Factor Authentication (MFA) & Secure Channels',
      domain: 'Authentication & Access Control',
      status: compliant ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: Math.round(snap.mfaEnforcementRate * 100),
      evidenceDigest: `MFA_RATE:${snap.mfaEnforcementRate}`,
      details: {
        mfaRate: snap.mfaEnforcementRate,
        targetRate: 1.0,
      },
      evaluatedAt,
    };
  }

  private evaluateArt23(snap: Nis2TelemetrySnapshot): Nis2ControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.unreportedIncidentAgeHours === undefined) {
      return {
        article: 'Article 23',
        controlCode: 'NIS2-ART23',
        title: '24-Hour Early Warning & 72-Hour Incident Notification',
        domain: 'Incident Reporting Timeline',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'No active incident reporting telemetry' },
        evaluatedAt,
      };
    }
    const compliant = snap.unreportedIncidentAgeHours <= 24;
    return {
      article: 'Article 23',
      controlCode: 'NIS2-ART23',
      title: '24-Hour Early Warning & 72-Hour Incident Notification',
      domain: 'Incident Reporting Timeline',
      status: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      complianceScore: compliant ? 100 : 0,
      evidenceDigest: `INCIDENT_AGE_HOURS:${snap.unreportedIncidentAgeHours}`,
      details: {
        unreportedIncidentAgeHours: snap.unreportedIncidentAgeHours,
        earlyWarningHours: 24,
        incidentNotificationHours: 72,
      },
      evaluatedAt,
    };
  }
}
