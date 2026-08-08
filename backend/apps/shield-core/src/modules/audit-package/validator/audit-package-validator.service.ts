import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { AuditPackageService } from '../audit-package.service';
import { AuditPackageStateMachineService } from '../audit-package-state-machine.service';

export interface ValidationResult {
  ready: boolean;
  blockingIssues: string[];
  limitations: string[];
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

  async validate(tenantId: string, packageId: string): Promise<ValidationResult> {
    const pkg = await this.auditPackageService.assertTenantOwnership(tenantId, packageId);
    const manifest = await this.prisma.auditPackageManifest.findUnique({ where: { package_id: pkg.id } });
    if (!manifest) {
      throw new NotFoundException(`AuditPackage '${packageId}' has not been built yet`);
    }

    const manifestCore = JSON.parse(manifest.manifest_core_content);
    const blockingIssues: string[] = [];
    const limitations: string[] = [...(manifestCore.limitations ?? [])];

    if (!manifestCore.scope) blockingIssues.push('Scope is not populated');
    if (!Array.isArray(manifestCore.evidenceIndex)) blockingIssues.push('Evidence index missing');
    if (manifestCore.evidenceIndex?.some((e: { integrityState: string }) => e.integrityState !== 'VERIFIED')) {
      limitations.push('One or more evidence items are not integrity-VERIFIED');
    }
    if (manifestCore.assessmentIndex?.some((a: { status: string }) => a.status === 'EVIDENCE_INCOMPLETE')) {
      blockingIssues.push('One or more assessments in scope have EVIDENCE_INCOMPLETE status');
    }
    if (manifestCore.assessmentIndex?.some((a: { reviewedAt: string | null }) => !a.reviewedAt)) {
      blockingIssues.push('One or more assessments in scope have not been human-reviewed');
    }
    if (manifestCore.assessmentIndex?.length === 0) {
      blockingIssues.push('No assessments in scope for this package');
    }

    // Risk acceptances that are silently expired never pass validation cleanly.
    const riskIds = (manifestCore.riskIndex ?? []).map((r: { riskId: string }) => r.riskId);
    if (riskIds.length > 0) {
      const acceptances = await this.prisma.riskAcceptance.findMany({ where: { risk_id: { in: riskIds } } });
      for (const acceptance of acceptances) {
        if (acceptance.status === 'ACTIVE' && acceptance.expires_at < new Date()) {
          limitations.push(`RiskAcceptance ${acceptance.id} for risk ${acceptance.risk_id} has expired and needs review`);
        }
      }
    }

    const ready = blockingIssues.length === 0;
    const nextStatus = ready ? 'READY_FOR_REVIEW' : 'INCOMPLETE';
    this.stateMachine.assertValidTransition(pkg.status, nextStatus);
    await this.prisma.auditPackage.update({ where: { id: pkg.id }, data: { status: nextStatus } });

    // Re-persist the potentially-updated limitations list back into ManifestCore and recompute
    // manifest_core_hash together with it — content and hash must never drift apart, even here.
    if (limitations.length !== (manifestCore.limitations ?? []).length) {
      manifestCore.limitations = limitations;
      const { contentHash } = this.hashService.hashCanonicalJson(manifestCore);
      await this.prisma.auditPackageManifest.update({
        where: { package_id: pkg.id },
        data: { manifest_core_content: JSON.stringify(manifestCore), manifest_core_hash: contentHash },
      });
    }

    return { ready, blockingIssues, limitations };
  }
}
