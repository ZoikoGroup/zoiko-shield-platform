import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { AuditPackageService } from '../audit-package.service';
import { AuditPackageStateMachineService } from '../audit-package-state-machine.service';
import { evaluateAuditPackageManifest } from '../claim/audit-package-claim.service';

export interface ValidationResult {
  ready: boolean;
  blockingIssues: string[];
  limitations: string[];
  completenessState: string;
  missingEvidence: string[];
  freshnessState: string;
  integrityState: string;
  verifierCompatibility: string;
  claimEligibility: boolean;
  eligibilityReason: string;
}

/** Spec §37's full checklist — never a bare boolean with no explanation. */
@Injectable()
export class AuditPackageValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly auditPackageService: AuditPackageService,
    private readonly stateMachine: AuditPackageStateMachineService,
  ) {}

  async validate(
    tenantId: string,
    packageId: string,
  ): Promise<ValidationResult> {
    const pkg = await this.auditPackageService.assertTenantOwnership(
      tenantId,
      packageId,
    );
    const manifest = await this.prisma.auditPackageManifest.findUnique({
      where: { package_id: pkg.id },
    });
    if (!manifest) {
      throw new NotFoundException(
        `AuditPackage '${packageId}' has not been built yet`,
      );
    }

    const manifestCore = JSON.parse(manifest.manifest_core_content);
    const blockingIssues: string[] = [];
    const limitations: string[] = [...(manifestCore.limitations ?? [])];

    if (!manifestCore.scope) blockingIssues.push('Scope is not populated');
    if (!Array.isArray(manifestCore.evidenceIndex))
      blockingIssues.push('Evidence index missing');
    if (
      manifestCore.evidenceIndex?.some(
        (e: { integrityState: string }) => e.integrityState !== 'VERIFIED',
      )
    ) {
      blockingIssues.push(
        'One or more evidence items are not integrity-VERIFIED',
      );
    }
    if (
      manifestCore.assessmentIndex?.some(
        (a: { status: string }) => a.status === 'EVIDENCE_INCOMPLETE',
      )
    ) {
      blockingIssues.push(
        'One or more assessments in scope have EVIDENCE_INCOMPLETE status',
      );
    }
    if (
      manifestCore.assessmentIndex?.some(
        (a: { reviewedAt: string | null }) => !a.reviewedAt,
      )
    ) {
      blockingIssues.push(
        'One or more assessments in scope have not been human-reviewed',
      );
    }
    if (manifestCore.assessmentIndex?.length === 0) {
      blockingIssues.push('No assessments in scope for this package');
    }

    // Risk acceptances that are silently expired never pass validation cleanly.
    const riskIds = (manifestCore.riskIndex ?? []).map(
      (r: { riskId: string }) => r.riskId,
    );
    if (riskIds.length > 0) {
      const acceptances = await this.prisma.riskAcceptance.findMany({
        where: { risk_id: { in: riskIds } },
      });
      for (const acceptance of acceptances) {
        if (
          acceptance.status === 'ACTIVE' &&
          acceptance.expires_at < new Date()
        ) {
          limitations.push(
            `RiskAcceptance ${acceptance.id} for risk ${acceptance.risk_id} has expired and needs review`,
          );
        }
      }
    }

    // Re-persist the potentially-updated limitations list back into ManifestCore and recompute
    // manifest_core_hash together with it — content and hash must never drift apart, even here.
    manifestCore.limitations = [...new Set(limitations)];
    const claimState = evaluateAuditPackageManifest(manifestCore, pkg.status);
    if (claimState.completenessState !== 'COMPLETE') {
      blockingIssues.push('Package completeness gate did not pass');
    }
    if (claimState.freshnessState !== 'CURRENT') {
      blockingIssues.push('One or more evidence sources are stale or unknown');
    }
    if (claimState.integrityState !== 'VERIFIED') {
      blockingIssues.push('Evidence integrity is not fully verified');
    }
    if (claimState.verifierCompatibility !== 'COMPATIBLE') {
      blockingIssues.push('Verifier compatibility is incomplete');
    }
    const dedupedIssues = [...new Set(blockingIssues)];
    const ready = dedupedIssues.length === 0;
    const nextStatus = ready ? 'READY_FOR_REVIEW' : 'INCOMPLETE';
    this.stateMachine.assertValidTransition(pkg.status, nextStatus);
    const { contentHash } = this.hashService.hashCanonicalJson(manifestCore);
    await this.prisma.$transaction([
      this.prisma.auditPackageManifest.update({
        where: { package_id: pkg.id },
        data: {
          manifest_core_content: JSON.stringify(manifestCore),
          manifest_core_hash: contentHash,
        },
      }),
      this.prisma.auditPackage.update({
        where: { id: pkg.id },
        data: {
          status: nextStatus,
          completeness_state: claimState.completenessState,
          missing_evidence: JSON.stringify(claimState.missingEvidence),
          freshness_state: claimState.freshnessState,
          limitations: JSON.stringify(claimState.limitations),
          verifier_compatibility: claimState.verifierCompatibility,
          claim_eligibility: false,
          claim_eligibility_reason: 'PACKAGE_NOT_FROZEN',
          approved_claim_wording: null,
          claim_assessed_at: new Date(),
        },
      }),
    ]);

    return {
      ready,
      blockingIssues: dedupedIssues,
      limitations: claimState.limitations,
      completenessState: claimState.completenessState,
      missingEvidence: claimState.missingEvidence,
      freshnessState: claimState.freshnessState,
      integrityState: claimState.integrityState,
      verifierCompatibility: claimState.verifierCompatibility,
      claimEligibility: false,
      eligibilityReason: 'PACKAGE_NOT_FROZEN',
    };
  }
}
