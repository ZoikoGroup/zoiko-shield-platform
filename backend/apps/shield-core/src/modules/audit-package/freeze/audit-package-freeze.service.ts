import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';
import { ObjectStorageService } from '../../evidence/storage/object-storage.service';
import { EvidenceLedgerService } from '../../evidence/ledger/evidence-ledger.service';
import { ShieldAnchorClient } from '../../../internal-client/shield-anchor.client';
import { AuditPackageService } from '../audit-package.service';
import { AuditPackageStateMachineService } from '../audit-package-state-machine.service';

/**
 * Freeze flow (spec correction #1 + #3): recompute manifestCoreHash fresh
 * → confirm it still matches the approved hash (else PACKAGE_CHANGED_AFTER_APPROVAL,
 * routes back to REAPPROVAL_REQUIRED — never silently proceeds on
 * stale-approved content) → request the anchor proof, sending ONLY the
 * already-computed manifestCoreHash (never the reverse — you cannot anchor
 * a hash before the bytes it represents exist) → merge into the final
 * envelope → hash the envelope itself → FROZEN.
 */
@Injectable()
export class AuditPackageFreezeService {
  private readonly logger = new Logger(AuditPackageFreezeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
    private readonly storageService: ObjectStorageService,
    private readonly ledgerService: EvidenceLedgerService,
    private readonly shieldAnchorClient: ShieldAnchorClient,
    private readonly auditPackageService: AuditPackageService,
    private readonly stateMachine: AuditPackageStateMachineService,
  ) {}

  async freeze(tenantId: string, packageId: string) {
    const pkg = await this.auditPackageService.assertTenantOwnership(tenantId, packageId);
    this.stateMachine.assertValidTransition(pkg.status, 'FROZEN');

    const manifest = await this.prisma.auditPackageManifest.findUnique({ where: { package_id: pkg.id } });
    if (!manifest || !manifest.manifest_core_hash) {
      throw new NotFoundException(`AuditPackage '${packageId}' has no built manifest`);
    }

    const manifestCore = JSON.parse(manifest.manifest_core_content);
    const { contentHash: recomputedHash } = this.hashService.hashCanonicalJson(manifestCore);

    const latestApproval = await this.prisma.auditPackageApproval.findFirst({
      where: { package_id: pkg.id },
      orderBy: { approved_at: 'desc' },
    });
    if (!latestApproval) {
      throw new NotFoundException(`AuditPackage '${packageId}' has no approval on record`);
    }

    if (recomputedHash !== latestApproval.manifest_core_hash || recomputedHash !== manifest.manifest_core_hash) {
      await this.prisma.auditPackage.update({ where: { id: pkg.id }, data: { status: 'REAPPROVAL_REQUIRED' } });
      throw new ConflictException('PACKAGE_CHANGED_AFTER_APPROVAL — manifest content no longer matches the approved manifestCoreHash; the package requires reapproval before it can be frozen');
    }

    const ledgerHead = await this.ledgerService.getHead(tenantId);
    if (!ledgerHead) {
      throw new NotFoundException(`Tenant '${tenantId}' has no evidence ledger entries to anchor`);
    }

    const proofEnvelope = await this.shieldAnchorClient.requestCheckpoint({
      tenantId,
      ledgerSequence: ledgerHead.sequence,
      ledgerHeadHash: ledgerHead.entry_hash,
      packageId: pkg.id,
      packageVersion: pkg.version,
      manifestCoreHash: recomputedHash,
    });

    // approvedAt is pre-stringified for the same reason every other Date going into hashed
    // content is (see AuditPackageBuilderService's toIso doc comment) — a raw Date collapses
    // to {} under ContentHashService's canonicalization.
    const finalManifest = { ...manifestCore, proofEnvelope, auditPackageApproval: { approverId: latestApproval.approver_id, manifestCoreHash: latestApproval.manifest_core_hash, authorizationDecisionId: latestApproval.authorization_decision_id, approvedAt: latestApproval.approved_at.toISOString() } };
    const { contentHash: packageEnvelopeHash } = this.hashService.hashCanonicalJson(finalManifest);

    await this.prisma.auditPackageManifest.update({
      where: { package_id: pkg.id },
      data: {
        proof_envelope_content: JSON.stringify(proofEnvelope),
        manifest_content: JSON.stringify(finalManifest),
        package_envelope_hash: packageEnvelopeHash,
      },
    });

    // Postgres (manifest_content above) is the authoritative source of the frozen envelope;
    // this object-storage copy is a distribution/export convenience, not the record of truth
    // — a write failure here is logged, not fatal, and never blocks reaching FROZEN.
    const objectKey = `audit-packages/${pkg.id}/manifest.json`;
    await this.storageService.putObject(objectKey, Buffer.from(JSON.stringify(finalManifest, null, 2), 'utf-8'), 'application/json').catch((err) => {
      this.logger.warn(`Object storage export failed for AuditPackage '${pkg.id}' — manifest remains authoritative in Postgres: ${(err as Error).message}`);
    });

    return this.prisma.auditPackage.update({ where: { id: pkg.id }, data: { status: 'FROZEN', frozen_at: new Date() } });
  }
}
