import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AuditPackageClaimState {
  completenessState: string;
  missingEvidence: string[];
  freshnessState: string;
  integrityState: string;
  verifierCompatibility: string;
  limitations: string[];
  claimEligibility: boolean;
  eligibilityReason: string;
  approvedWording?: string;
}

const CLAIM_WORDING =
  'Evidence package complete and independently verifiable for the stated scope, period, sources, and limitations.';

export function evaluateAuditPackageManifest(
  manifestCore: Record<string, any>,
  packageStatus: string,
): AuditPackageClaimState {
  const evidence = Array.isArray(manifestCore.evidenceIndex)
    ? manifestCore.evidenceIndex
    : [];
  const assessments = Array.isArray(manifestCore.assessmentIndex)
    ? manifestCore.assessmentIndex
    : [];
  const knownGaps = Array.isArray(manifestCore.knownGaps)
    ? manifestCore.knownGaps
    : [];
  const missingEvidence: string[] = [];
  if (evidence.length === 0) missingEvidence.push('NO_EVIDENCE_IN_SCOPE');
  if (assessments.length === 0) missingEvidence.push('NO_ASSESSMENTS_IN_SCOPE');
  for (const gap of knownGaps) {
    if (gap.status !== 'RESOLVED') {
      missingEvidence.push(
        `${gap.type ?? 'EVIDENCE_GAP'}:${gap.reason ?? gap.assessmentId ?? 'UNKNOWN'}`,
      );
    }
  }
  for (const item of evidence) {
    if (item.completenessState !== 'COMPLETE') {
      missingEvidence.push(
        `EVIDENCE_NOT_COMPLETE:${item.evidenceId ?? 'UNKNOWN'}`,
      );
    }
  }
  for (const assessment of assessments) {
    if (
      assessment.status === 'EVIDENCE_INCOMPLETE' ||
      assessment.completenessState !== 'COMPLETE'
    ) {
      missingEvidence.push(
        `ASSESSMENT_NOT_COMPLETE:${assessment.assessmentId ?? 'UNKNOWN'}`,
      );
    }
    if (!assessment.reviewedAt) {
      missingEvidence.push(
        `ASSESSMENT_NOT_REVIEWED:${assessment.assessmentId ?? 'UNKNOWN'}`,
      );
    }
  }
  const dedupedMissing = [...new Set(missingEvidence)];
  const freshnessState =
    evidence.length > 0 &&
    assessments.length > 0 &&
    evidence.every((item: any) => item.freshnessState === 'CURRENT') &&
    assessments.every((item: any) => item.freshnessState === 'CURRENT')
      ? 'CURRENT'
      : 'STALE_OR_UNKNOWN';
  const integrityState =
    evidence.length > 0 &&
    assessments.length > 0 &&
    evidence.every((item: any) => item.integrityState === 'VERIFIED') &&
    assessments.every((item: any) => item.integrityState === 'VERIFIED')
      ? 'VERIFIED'
      : 'UNVERIFIED_OR_FAILED';
  const verifier = manifestCore.verifierProfile;
  const verifierCompatibility =
    verifier?.minVerifierVersion &&
    verifier?.verifierSourceVersion &&
    verifier?.treeProfile &&
    verifier?.hashAlgorithm &&
    verifier?.canonicalizationProfile
      ? 'COMPATIBLE'
      : 'INCOMPATIBLE_OR_UNKNOWN';
  const completenessState =
    dedupedMissing.length === 0 ? 'COMPLETE' : 'INCOMPLETE';
  const limitations = Array.isArray(manifestCore.limitations)
    ? [...new Set(manifestCore.limitations as string[])]
    : [];
  const gates = [
    [packageStatus === 'FROZEN', 'PACKAGE_NOT_FROZEN'],
    [completenessState === 'COMPLETE', 'PACKAGE_INCOMPLETE'],
    [freshnessState === 'CURRENT', 'EVIDENCE_STALE_OR_UNKNOWN'],
    [integrityState === 'VERIFIED', 'EVIDENCE_NOT_VERIFIED'],
    [verifierCompatibility === 'COMPATIBLE', 'VERIFIER_INCOMPATIBLE'],
  ] as const;
  const failed = gates.find(([passes]) => !passes);
  return {
    completenessState,
    missingEvidence: dedupedMissing,
    freshnessState,
    integrityState,
    verifierCompatibility,
    limitations,
    claimEligibility: !failed,
    eligibilityReason: failed ? failed[1] : 'ALL_PACKAGE_CLAIM_GATES_PASSED',
    approvedWording: failed ? undefined : CLAIM_WORDING,
  };
}

/** F2 persisted claim gate; this service never emits certification wording. */
@Injectable()
export class AuditPackageClaimService {
  constructor(private readonly prisma: PrismaService) {}

  async assess(tenantId: string, packageId: string, assessedBy: string) {
    const pkg = await this.prisma.auditPackage.findFirst({
      where: { id: packageId, tenant_id: tenantId },
    });
    if (!pkg) {
      throw new NotFoundException(`AuditPackage '${packageId}' not found`);
    }
    const manifest = await this.prisma.auditPackageManifest.findUnique({
      where: { package_id: pkg.id },
    });
    if (!manifest) {
      throw new NotFoundException(
        `AuditPackage '${packageId}' has no manifest`,
      );
    }
    const manifestCore = JSON.parse(manifest.manifest_core_content) as Record<
      string,
      unknown
    >;
    const result = evaluateAuditPackageManifest(manifestCore, pkg.status);
    return this.prisma.$transaction(async (tx) => {
      const assessment = await tx.auditPackageClaimAssessment.create({
        data: {
          tenant_id: tenantId,
          package_id: pkg.id,
          package_version: pkg.version,
          manifest_hash:
            manifest.package_envelope_hash ?? manifest.manifest_core_hash,
          completeness_state: result.completenessState,
          missing_evidence: JSON.stringify(result.missingEvidence),
          freshness_state: result.freshnessState,
          integrity_state: result.integrityState,
          verifier_compatibility: result.verifierCompatibility,
          limitations: JSON.stringify(result.limitations),
          claim_eligibility: result.claimEligibility,
          eligibility_reason: result.eligibilityReason,
          approved_wording: result.approvedWording,
          assessed_by: assessedBy,
        },
      });
      const packageRecord = await tx.auditPackage.update({
        where: { id: pkg.id },
        data: {
          completeness_state: result.completenessState,
          missing_evidence: JSON.stringify(result.missingEvidence),
          freshness_state: result.freshnessState,
          limitations: JSON.stringify(result.limitations),
          verifier_compatibility: result.verifierCompatibility,
          claim_eligibility: result.claimEligibility,
          claim_eligibility_reason: result.eligibilityReason,
          approved_claim_wording: result.approvedWording,
          claim_assessed_at: new Date(),
          frozen_manifest_hash:
            pkg.status === 'FROZEN'
              ? manifest.package_envelope_hash
              : undefined,
        },
      });
      return { package: packageRecord, assessment };
    });
  }

  async get(tenantId: string, packageId: string) {
    const pkg = await this.prisma.auditPackage.findFirst({
      where: { id: packageId, tenant_id: tenantId },
      include: {
        claimAssessments: { orderBy: { assessed_at: 'desc' }, take: 20 },
      },
    });
    if (!pkg) {
      throw new NotFoundException(`AuditPackage '${packageId}' not found`);
    }
    return {
      packageId: pkg.id,
      packageVersion: pkg.version,
      status: pkg.status,
      completenessState: pkg.completeness_state,
      missingEvidence: JSON.parse(pkg.missing_evidence),
      freshnessState: pkg.freshness_state,
      limitations: JSON.parse(pkg.limitations),
      verifierCompatibility: pkg.verifier_compatibility,
      claimEligibility: pkg.claim_eligibility,
      eligibilityReason: pkg.claim_eligibility_reason,
      approvedWording: pkg.approved_claim_wording,
      frozenManifestHash: pkg.frozen_manifest_hash,
      assessedAt: pkg.claim_assessed_at,
      history: pkg.claimAssessments,
    };
  }
}
