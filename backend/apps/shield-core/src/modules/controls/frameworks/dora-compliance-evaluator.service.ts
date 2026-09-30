import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { computeDomainSeparatedMerkleRoot } from '../../../common/merkle.util';

export interface DoraTelemetrySnapshot {
  multiCloudRecoveryRtoMinutes?: number; // Target: <= 120 min
  multiCloudRecoveryRpoMinutes?: number; // Target: 0 min
  boundaryDefenseMfaRate?: number; // Target: 1.0 (100%)
  ocsfDetectionPipelineLatencyMs?: number; // Target: <= 500 ms
  automatedContainmentTested?: boolean;
  rollbackReceiptVerificationPassRate?: number; // Target: 1.0 (100%)
  tlptLastExerciseDaysAgo?: number; // Target: <= 365 days
  thirdPartyHhiIndex?: number; // Target: < 2500 (moderate concentration)
  tier1ProviderFallbackConfigured?: boolean;
  activeMajorIncidentCount?: number;
  unreportedIncidentAgeHours?: number; // Target: <= 4 hours for initial notification
}

export interface DoraControlEvaluation {
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

export interface DoraAssessmentReport {
  assessmentId: string;
  framework: 'DORA_EU_2022_2554';
  tenantId: string;
  environmentId: string;
  overallComplianceScore: number | null;
  totalArticlesEvaluated: number;
  compliantCount: number;
  gapCount: number;
  notEvaluatedCount: number;
  majorIncidentNotificationStatus: {
    withinInitialWindow: boolean;
    initialNotificationDeadlineHours: 4;
    intermediateReportDeadlineHours: 24;
    finalReportDeadlineDays: 30;
  };
  evaluations: DoraControlEvaluation[];
  merkleEvidenceRoot: string;
  evaluatedAt: string;
}

@Injectable()
export class DoraComplianceEvaluatorService {
  private readonly logger = new Logger(DoraComplianceEvaluatorService.name);

  /**
   * Evaluates a financial entity's operational telemetry against DORA (EU 2022/2554).
   * Articles Evaluated:
   * - Art. 6: ICT Risk Management Framework & Multi-Cloud Recovery
   * - Art. 9: Protection and Prevention Capabilities
   * - Art. 10: Detection of Anomalous Activities
   * - Art. 11: ICT Response & Reversible SOAR Recovery
   * - Art. 19: Major ICT-Related Incident Reporting Timeline (4h / 24h / 30d)
   * - Art. 26: Threat-Led Penetration Testing (TLPT)
   * - Art. 28: ICT Third-Party Concentration Risk (HHI)
   */
  evaluateDoraPosture(
    tenantId: string,
    environmentId: string,
    telemetry?: DoraTelemetrySnapshot,
  ): DoraAssessmentReport {
    const assessmentId = `dora-eval-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();
    const snap = telemetry ?? {};
    const evaluations: DoraControlEvaluation[] = [];
    const evidenceHashes: string[] = [];

    // Art. 6: ICT Risk Management & Recovery (RPO=0, RTO <= 120min)
    const art6 = this.evaluateArt6(snap);
    evaluations.push(art6);
    evidenceHashes.push(this.hashEvidence('DORA-ART6', art6));

    // Art. 9: Protection & Prevention (MFA & Boundary Isolation)
    const art9 = this.evaluateArt9(snap);
    evaluations.push(art9);
    evidenceHashes.push(this.hashEvidence('DORA-ART9', art9));

    // Art. 10: Detection of Anomalous Activities (Latency <= 500ms)
    const art10 = this.evaluateArt10(snap);
    evaluations.push(art10);
    evidenceHashes.push(this.hashEvidence('DORA-ART10', art10));

    // Art. 11: Response & Recovery (Reversible rollback receipts)
    const art11 = this.evaluateArt11(snap);
    evaluations.push(art11);
    evidenceHashes.push(this.hashEvidence('DORA-ART11', art11));

    // Art. 19: Incident Reporting Timeline (Initial <= 4h)
    const art19 = this.evaluateArt19(snap);
    evaluations.push(art19);
    evidenceHashes.push(this.hashEvidence('DORA-ART19', art19));

    // Art. 26: TLPT & Resilience Drills (Annual cadency)
    const art26 = this.evaluateArt26(snap);
    evaluations.push(art26);
    evidenceHashes.push(this.hashEvidence('DORA-ART26', art26));

    // Art. 28: ICT Third-Party Risk & HHI Concentration
    const art28 = this.evaluateArt28(snap);
    evaluations.push(art28);
    evidenceHashes.push(this.hashEvidence('DORA-ART28', art28));

    // Calculate aggregate score
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

    const withinInitialWindow =
      snap.unreportedIncidentAgeHours !== undefined
        ? snap.unreportedIncidentAgeHours <= 4
        : true;

    return {
      assessmentId,
      framework: 'DORA_EU_2022_2554',
      tenantId,
      environmentId,
      overallComplianceScore: overallScore,
      totalArticlesEvaluated: evaluations.length,
      compliantCount: evaluations.filter((e) => e.status === 'COMPLIANT')
        .length,
      gapCount: evaluations.filter(
        (e) => e.status === 'NON_COMPLIANT' || e.status === 'GAP_DETECTED',
      ).length,
      notEvaluatedCount: evaluations.filter((e) => e.status === 'NOT_EVALUATED')
        .length,
      majorIncidentNotificationStatus: {
        withinInitialWindow,
        initialNotificationDeadlineHours: 4,
        intermediateReportDeadlineHours: 24,
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

  private evaluateArt6(snap: DoraTelemetrySnapshot): DoraControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (
      snap.multiCloudRecoveryRtoMinutes === undefined ||
      snap.multiCloudRecoveryRpoMinutes === undefined
    ) {
      return {
        article: 'Article 6',
        controlCode: 'DORA-ART6',
        title: 'ICT Risk Management Framework & Disaster Recovery',
        domain: 'ICT Risk Governance',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing recovery RTO/RPO measurement' },
        evaluatedAt,
      };
    }
    const compliant =
      snap.multiCloudRecoveryRtoMinutes <= 120 &&
      snap.multiCloudRecoveryRpoMinutes === 0;
    return {
      article: 'Article 6',
      controlCode: 'DORA-ART6',
      title: 'ICT Risk Management Framework & Disaster Recovery',
      domain: 'ICT Risk Governance',
      status: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      complianceScore: compliant ? 100 : 40,
      evidenceDigest: `RTO:${snap.multiCloudRecoveryRtoMinutes}m;RPO:${snap.multiCloudRecoveryRpoMinutes}m`,
      details: {
        rtoMinutes: snap.multiCloudRecoveryRtoMinutes,
        rpoMinutes: snap.multiCloudRecoveryRpoMinutes,
        targetRtoMinutes: 120,
        targetRpoMinutes: 0,
      },
      evaluatedAt,
    };
  }

  private evaluateArt9(snap: DoraTelemetrySnapshot): DoraControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.boundaryDefenseMfaRate === undefined) {
      return {
        article: 'Article 9',
        controlCode: 'DORA-ART9',
        title: 'Protection and Prevention Capabilities',
        domain: 'Logical & Physical Protection',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing MFA rate measurement' },
        evaluatedAt,
      };
    }
    const compliant = snap.boundaryDefenseMfaRate >= 0.99;
    return {
      article: 'Article 9',
      controlCode: 'DORA-ART9',
      title: 'Protection and Prevention Capabilities',
      domain: 'Logical & Physical Protection',
      status: compliant ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: Math.round(snap.boundaryDefenseMfaRate * 100),
      evidenceDigest: `MFA_RATE:${snap.boundaryDefenseMfaRate}`,
      details: {
        mfaRate: snap.boundaryDefenseMfaRate,
        targetRate: 1.0,
      },
      evaluatedAt,
    };
  }

  private evaluateArt10(snap: DoraTelemetrySnapshot): DoraControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.ocsfDetectionPipelineLatencyMs === undefined) {
      return {
        article: 'Article 10',
        controlCode: 'DORA-ART10',
        title: 'Detection of Anomalous Activities',
        domain: 'Continuous Detection & Monitoring',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing detection pipeline latency measurement' },
        evaluatedAt,
      };
    }
    const compliant = snap.ocsfDetectionPipelineLatencyMs <= 500;
    return {
      article: 'Article 10',
      controlCode: 'DORA-ART10',
      title: 'Detection of Anomalous Activities',
      domain: 'Continuous Detection & Monitoring',
      status: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      complianceScore: compliant
        ? 100
        : Math.max(
            0,
            Math.round(100 - (snap.ocsfDetectionPipelineLatencyMs - 500) / 10),
          ),
      evidenceDigest: `LATENCY:${snap.ocsfDetectionPipelineLatencyMs}ms`,
      details: {
        latencyMs: snap.ocsfDetectionPipelineLatencyMs,
        targetLatencyMs: 500,
      },
      evaluatedAt,
    };
  }

  private evaluateArt11(snap: DoraTelemetrySnapshot): DoraControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (
      snap.automatedContainmentTested === undefined ||
      snap.rollbackReceiptVerificationPassRate === undefined
    ) {
      return {
        article: 'Article 11',
        controlCode: 'DORA-ART11',
        title: 'ICT Response and Recovery Capabilities',
        domain: 'Incident Response & Rollback',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing SOAR rollback testing metrics' },
        evaluatedAt,
      };
    }
    const compliant =
      snap.automatedContainmentTested &&
      snap.rollbackReceiptVerificationPassRate === 1.0;
    return {
      article: 'Article 11',
      controlCode: 'DORA-ART11',
      title: 'ICT Response and Recovery Capabilities',
      domain: 'Incident Response & Rollback',
      status: compliant ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: compliant
        ? 100
        : Math.round(snap.rollbackReceiptVerificationPassRate * 80),
      evidenceDigest: `CONTAINMENT:${snap.automatedContainmentTested};ROLLBACK_PASS:${snap.rollbackReceiptVerificationPassRate}`,
      details: {
        containmentTested: snap.automatedContainmentTested,
        rollbackReceiptVerificationPassRate:
          snap.rollbackReceiptVerificationPassRate,
      },
      evaluatedAt,
    };
  }

  private evaluateArt19(snap: DoraTelemetrySnapshot): DoraControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.unreportedIncidentAgeHours === undefined) {
      return {
        article: 'Article 19',
        controlCode: 'DORA-ART19',
        title: 'Major ICT-Related Incident Reporting Timeline',
        domain: 'Regulatory Incident Reporting',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'No active incident reporting telemetry' },
        evaluatedAt,
      };
    }
    const compliant = snap.unreportedIncidentAgeHours <= 4;
    return {
      article: 'Article 19',
      controlCode: 'DORA-ART19',
      title: 'Major ICT-Related Incident Reporting Timeline',
      domain: 'Regulatory Incident Reporting',
      status: compliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      complianceScore: compliant ? 100 : 0,
      evidenceDigest: `INCIDENT_AGE_HOURS:${snap.unreportedIncidentAgeHours}`,
      details: {
        unreportedIncidentAgeHours: snap.unreportedIncidentAgeHours,
        initialDeadlineHours: 4,
        intermediateDeadlineHours: 24,
        finalReportDeadlineDays: 30,
      },
      evaluatedAt,
    };
  }

  private evaluateArt26(snap: DoraTelemetrySnapshot): DoraControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (snap.tlptLastExerciseDaysAgo === undefined) {
      return {
        article: 'Article 26',
        controlCode: 'DORA-ART26',
        title: 'Threat-Led Penetration Testing (TLPT)',
        domain: 'Advanced Resilience Testing',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing TLPT exercise history' },
        evaluatedAt,
      };
    }
    const compliant = snap.tlptLastExerciseDaysAgo <= 365;
    return {
      article: 'Article 26',
      controlCode: 'DORA-ART26',
      title: 'Threat-Led Penetration Testing (TLPT)',
      domain: 'Advanced Resilience Testing',
      status: compliant ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: compliant
        ? 100
        : Math.max(0, 100 - (snap.tlptLastExerciseDaysAgo - 365)),
      evidenceDigest: `TLPT_DAYS_AGO:${snap.tlptLastExerciseDaysAgo}`,
      details: {
        lastExerciseDaysAgo: snap.tlptLastExerciseDaysAgo,
        maxCadenceDays: 365,
      },
      evaluatedAt,
    };
  }

  private evaluateArt28(snap: DoraTelemetrySnapshot): DoraControlEvaluation {
    const evaluatedAt = new Date().toISOString();
    if (
      snap.thirdPartyHhiIndex === undefined ||
      snap.tier1ProviderFallbackConfigured === undefined
    ) {
      return {
        article: 'Article 28',
        controlCode: 'DORA-ART28',
        title: 'ICT Third-Party Concentration Risk Management',
        domain: 'Third-Party Risk Governance',
        status: 'NOT_EVALUATED',
        complianceScore: null,
        evidenceDigest: 'UNMEASURED',
        details: { reason: 'Missing third-party vendor concentration data' },
        evaluatedAt,
      };
    }
    const compliant =
      snap.thirdPartyHhiIndex < 2500 && snap.tier1ProviderFallbackConfigured;
    return {
      article: 'Article 28',
      controlCode: 'DORA-ART28',
      title: 'ICT Third-Party Concentration Risk Management',
      domain: 'Third-Party Risk Governance',
      status: compliant ? 'COMPLIANT' : 'GAP_DETECTED',
      complianceScore: compliant ? 100 : 50,
      evidenceDigest: `HHI:${snap.thirdPartyHhiIndex};FALLBACK:${snap.tier1ProviderFallbackConfigured}`,
      details: {
        hhiIndex: snap.thirdPartyHhiIndex,
        hhiThreshold: 2500,
        tier1Fallback: snap.tier1ProviderFallbackConfigured,
      },
      evaluatedAt,
    };
  }
}
