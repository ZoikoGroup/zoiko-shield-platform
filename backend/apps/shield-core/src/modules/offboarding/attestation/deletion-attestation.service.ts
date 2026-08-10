import { Injectable, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../../evidence/hashing/content-hash.service';

/**
 * This is NOT "all data instantly disappeared" unless that fact was
 * actually verified (spec §71) — discloses retained scopes, legal holds,
 * pending backup expiry, and per-store verification results rather than
 * a blanket "deleted" claim.
 */
@Injectable()
export class DeletionAttestationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
  ) {}

  async issue(tenantId: string, deletionRequestId: string, issuedBy: string) {
    const tasks = await this.prisma.deletionTask.findMany({ where: { deletion_request_id: deletionRequestId } });
    if (tasks.some((t) => t.status === 'PENDING' || t.status === 'RUNNING')) {
      throw new ConflictException('Deletion tasks are still in progress — attestation cannot be issued yet');
    }

    const backupRecords = await this.prisma.backupExpiryRecord.findMany({ where: { deletion_request_id: deletionRequestId } });
    const legalHolds = await this.prisma.legalHold.findMany({ where: { tenant_id: tenantId, status: 'ACTIVE' } });

    const deletedScopes = tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.store_type);
    const retainedScopes = legalHolds.map((h) => ({ legalHoldId: h.id, reason: h.reason, scope: h.scope }));
    const limitations: string[] = [];
    if (backupRecords.some((b) => b.status === 'PENDING')) limitations.push('One or more backup classes remain PENDING expiry — see backupExpiryRefs');
    if (tasks.some((t) => t.status === 'FAILED')) limitations.push(`${tasks.filter((t) => t.status === 'FAILED').length} deletion task(s) FAILED — see derivedStoreResults`);

    const attestationBody = {
      tenantId, deletionRequestId, deletedScopes, retainedScopes,
      backupExpiryRefs: backupRecords.map((b) => ({ id: b.id, backupClass: b.backup_class, status: b.status, retainedUntil: b.retained_until.toISOString() })),
      derivedStoreResults: tasks.map((t) => ({ storeType: t.store_type, status: t.status, verificationResult: t.verification_result })),
      limitations,
    };
    const { contentHash: attestationHash } = this.hashService.hashCanonicalJson(attestationBody);

    return this.prisma.deletionAttestation.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        deletion_request_id: deletionRequestId,
        deleted_scopes: JSON.stringify(deletedScopes),
        retained_scopes: JSON.stringify(retainedScopes),
        legal_hold_refs: JSON.stringify(legalHolds.map((h) => h.id)),
        backup_expiry_refs: JSON.stringify(backupRecords.map((b) => b.id)),
        derived_store_results: JSON.stringify(attestationBody.derivedStoreResults),
        limitations: JSON.stringify(limitations),
        attestation_hash: attestationHash,
        issued_by: issuedBy,
      },
    });
  }
}
