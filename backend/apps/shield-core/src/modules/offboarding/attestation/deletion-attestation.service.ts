import { Injectable, ConflictException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(DeletionAttestationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
  ) {}

  async issue(tenantId: string, deletionRequestId: string, issuedBy: string) {
    const tasks = await this.prisma.deletionTask.findMany({
      where: { deletion_request_id: deletionRequestId },
    });
    if (tasks.length === 0 || tasks.some((t) => t.status !== 'COMPLETED')) {
      throw new ConflictException(
        'Every deletion task must complete successfully before an attestation can be issued',
      );
    }

    const results = tasks.map((task) => {
      try {
        return {
          task,
          result: JSON.parse(task.verification_result ?? '{}') as {
            outcome?: string;
            wormProtectedVersions?: number;
            physicalExpiryAt?: string | null;
          },
        };
      } catch {
        throw new ConflictException(
          `Deletion task '${task.id}' has an unverifiable result`,
        );
      }
    });
    if (
      results.some(
        ({ result }) =>
          ![
            'VERIFIED_DELETED',
            'NOT_APPLICABLE',
            // Bytes an immutable Object Lock window forbids destroying. Not a
            // deletion — a disclosed retention, valid only because the keys
            // that could read them are shredded.
            'LOGICALLY_DELETED_PENDING_PHYSICAL_EXPIRY',
          ].includes(result.outcome ?? ''),
      )
    ) {
      throw new ConflictException(
        'One or more deletion tasks lacks a verified terminal result',
      );
    }

    const backupRecords = await this.prisma.backupExpiryRecord.findMany({
      where: { deletion_request_id: deletionRequestId },
    });
    const legalHolds = await this.prisma.legalHold.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
    });

    const deletedScopes = results
      .filter(({ result }) => result.outcome === 'VERIFIED_DELETED')
      .map(({ task }) => task.store_type);
    const retainedScopes = [
      ...legalHolds.map((h) => ({
        legalHoldId: h.id,
        reason: h.reason,
        scope: h.scope,
      })),
      {
        scope: 'DELETION_CONTROL_AND_AUDIT_RECORDS',
        reason: 'Retained to prove and reconcile the deletion operation',
      },
      ...results
        .filter(
          ({ result }) =>
            result.outcome === 'LOGICALLY_DELETED_PENDING_PHYSICAL_EXPIRY',
        )
        .map(({ task, result }) => ({
          scope: `${task.store_type}_WORM_PROTECTED_OBJECTS`,
          reason: `${result.wormProtectedVersions ?? 0} object version(s) are held immutable by Object Lock until ${result.physicalExpiryAt ?? 'an undetermined date'} and cannot be destroyed before then; the tenant's encryption keys are shredded, so the retained ciphertext is unreadable`,
        })),
    ];
    const limitations: string[] = [];
    const wormRetained = results.filter(
      ({ result }) =>
        result.outcome === 'LOGICALLY_DELETED_PENDING_PHYSICAL_EXPIRY',
    );
    for (const { task, result } of wormRetained) {
      limitations.push(
        `${task.store_type}: ${result.wormProtectedVersions ?? 0} object version(s) remain physically stored under an immutable retention lock until ${result.physicalExpiryAt ?? 'an undetermined date'}; erasure is achieved cryptographically, not by physical destruction`,
      );
    }
    if (backupRecords.some((b) => b.status === 'PENDING'))
      limitations.push(
        'One or more backup classes remain PENDING expiry — see backupExpiryRefs',
      );
    const notApplicable = results
      .filter(({ result }) => result.outcome === 'NOT_APPLICABLE')
      .map(({ task }) => task.store_type);
    if (notApplicable.length > 0)
      limitations.push(
        `Stores not populated in this deployment: ${notApplicable.join(', ')}`,
      );

    const verification = await this.prisma.deletionVerification.findFirst({
      where: { deletion_request_id: deletionRequestId },
      orderBy: { verified_at: 'desc' },
    });
    if (!verification || verification.result !== 'PASS') {
      this.logger.error(
        `Attestation attempted for tenant ${tenantId} (request ${deletionRequestId}) ${verification ? `with verification result ${verification.result}` : 'with no verification on record'} — refused`,
      );
      throw new ConflictException(
        'An attestation may only be issued after an independent deletion verification has passed',
      );
    }

    const attestationBody = {
      tenantId,
      deletionRequestId,
      verification: {
        id: verification.id,
        result: verification.result,
        residualCount: verification.residual_count,
        retainedCount: verification.retained_count,
        verifiedAt: verification.verified_at.toISOString(),
        surfaces: verification.surfaces,
      },
      deletedScopes,
      retainedScopes,
      backupExpiryRefs: backupRecords.map((b) => ({
        id: b.id,
        backupClass: b.backup_class,
        status: b.status,
        retainedUntil: b.retained_until.toISOString(),
      })),
      derivedStoreResults: tasks.map((t) => ({
        storeType: t.store_type,
        status: t.status,
        verificationResult: t.verification_result,
      })),
      limitations,
    };
    const { contentHash: attestationHash } =
      this.hashService.hashCanonicalJson(attestationBody);

    return this.prisma.deletionAttestation.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        deletion_request_id: deletionRequestId,
        deleted_scopes: JSON.stringify(deletedScopes),
        retained_scopes: JSON.stringify(retainedScopes),
        legal_hold_refs: JSON.stringify(legalHolds.map((h) => h.id)),
        backup_expiry_refs: JSON.stringify(backupRecords.map((b) => b.id)),
        derived_store_results: JSON.stringify(
          attestationBody.derivedStoreResults,
        ),
        limitations: JSON.stringify(limitations),
        attestation_hash: attestationHash,
        issued_by: issuedBy,
      },
    });
  }
}
