import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceRepository } from '../repositories/evidence.repository';
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
  ) {}

  async verify(
    tenantId: string,
    evidenceId: string,
  ): Promise<{
    integrityState: 'VERIFIED' | 'FAILED';
    contentHash: string;
    storedHash: string;
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
    const integrityState =
      recomputedHash === evidence.content_hash ? 'VERIFIED' : 'FAILED';

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
    }

    return {
      integrityState,
      contentHash: evidence.content_hash,
      storedHash: recomputedHash,
    };
  }
}
