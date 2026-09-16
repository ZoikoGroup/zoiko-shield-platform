import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceRepository } from '../repositories/evidence.repository';
import { CollectorSignatureService } from '../signing/collector-signature.service';
import { EVIDENCE_TOPICS } from '../events/evidence-events';

/**
 * Re-reads the stored bytes from object storage, re-hashes them, and
 * compares against the recorded content_hash — this is the actual
 * integrity check (spec §27). Any mismatch (tamper, corruption, wrong
 * object) flips integrity_state to FAILED rather than silently leaving it
 * PENDING or assuming success.
 */
@Injectable()
export class EvidenceVerificationService {
  private readonly logger = new Logger(EvidenceVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly hashService: ContentHashService,
    private readonly storageService: ObjectStorageService,
    private readonly evidenceRepository: EvidenceRepository,
    private readonly collectorSignature: CollectorSignatureService,
  ) {}

  async verify(
    tenantId: string,
    evidenceId: string,
  ): Promise<{
    integrityState: 'VERIFIED' | 'FAILED' | 'SIGNATURE_FAILED';
    contentHash: string;
    storedHash: string;
    signatureState: 'VERIFIED' | 'FAILED' | 'UNSIGNED';
  }> {
    const evidence = await this.evidenceRepository.findByTenantAndId(
      tenantId,
      evidenceId,
    );
    if (!evidence || !evidence.vault_reference) {
      throw new Error(
        `Evidence '${evidenceId}' not found or has no stored object`,
      );
    }

    const bytes = await this.storageService.getObject(evidence.vault_reference);
    const recomputedHash = this.hashService.hash(bytes);
    const hashMatches = recomputedHash === evidence.content_hash;

    // Matching bytes only prove nothing changed since we stored them. The
    // collector signature is what ties those bytes to who produced them, so
    // a valid hash with a broken signature is reported distinctly rather
    // than being rounded up to VERIFIED.
    const signatureValid = await this.collectorSignature.verify(evidence);
    const signatureState: 'VERIFIED' | 'FAILED' | 'UNSIGNED' =
      signatureValid === null
        ? 'UNSIGNED'
        : signatureValid
          ? 'VERIFIED'
          : 'FAILED';

    const integrityState: 'VERIFIED' | 'FAILED' | 'SIGNATURE_FAILED' =
      !hashMatches
        ? 'FAILED'
        : signatureState === 'FAILED'
          ? 'SIGNATURE_FAILED'
          : 'VERIFIED';

    await this.prisma.$transaction([
      this.prisma.evidenceRecord.update({
        where: { id: evidenceId },
        data: { integrity_state: integrityState },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: EVIDENCE_TOPICS.EVIDENCE_VERIFIED,
          eventType: 'evidence.verified',
          payload: { evidenceId, integrityState },
        }),
      }),
    ]);

    if (integrityState === 'FAILED') {
      this.logger.error(
        `Evidence integrity FAILED for ${evidenceId}: expected ${evidence.content_hash}, got ${recomputedHash}`,
      );
    } else if (integrityState === 'SIGNATURE_FAILED') {
      this.logger.error(
        `Evidence ${evidenceId} has intact bytes but an invalid collector signature (key ${evidence.collector_signing_key_id})`,
      );
    }

    return {
      integrityState,
      contentHash: evidence.content_hash,
      storedHash: recomputedHash,
      signatureState,
    };
  }
}
