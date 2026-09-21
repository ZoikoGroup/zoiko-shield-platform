import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceLedgerService } from '../ledger/evidence-ledger.service';
import { EvidenceLineageService } from '../lineage/evidence-lineage.service';
import { EvidenceRepository } from '../repositories/evidence.repository';
import { CollectorSignatureService } from '../signing/collector-signature.service';
import { EVIDENCE_TOPICS } from '../events/evidence-events';
import { requireEnvironmentId, requireRegion } from '../../../tenant-context';

export interface CreateEvidenceInput {
  tenantId: string;
  environmentId: string;
  legalEntityId?: string;
  region: string;
  evidenceType: string;
  producingService: string;
  sourceSystemId: string;
  sourceObjectId: string;
  collectorId?: string;
  collectorVersion?: string;
  sourceObservedAt?: Date;
  periodStart?: Date;
  periodEnd?: Date;
  purpose: string;
  dataClass?: string;
  /** Structured evidence: canonicalized, then hashed. */
  content?: Record<string, unknown>;
  /** Opaque bytes (a human-uploaded artifact): hashed as-is. */
  rawContent?: Buffer;
  mediaType?: string;
  retentionProfile?: string;
  parentEvidenceId?: string;
  lineageRelationship?: string;
  caseId?: string;
  addedBy?: string;
  collectionMethod?: 'AUTOMATED' | 'MANUAL';
  uploaderIdentity?: string;
  uploadReason?: string;
  manualReviewRequired?: boolean;
  expiresAt?: Date;
}

/**
 * Single write path for evidence (spec §35 — "avoid direct writes...
 * instead: Alert Service -> EvidenceService.createEvidence()"). Nothing
 * else in shield-core inserts EvidenceRecord rows directly.
 */
@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly hashService: ContentHashService,
    private readonly storageService: ObjectStorageService,
    private readonly ledgerService: EvidenceLedgerService,
    private readonly lineageService: EvidenceLineageService,
    private readonly evidenceRepository: EvidenceRepository,
    private readonly collectorSignature: CollectorSignatureService,
  ) {}

  async createEvidence(input: CreateEvidenceInput) {
    const evidenceId = randomUUID();
    const isRaw = Boolean(input.rawContent);
    const mediaType =
      input.mediaType ??
      (isRaw ? 'application/octet-stream' : 'application/json');

    if (!isRaw && !input.content) {
      throw new BadRequestException(
        'Evidence requires either structured content or raw bytes',
      );
    }

    // Raw uploads are hashed exactly as received: canonicalizing someone
    // else's artifact would hash something the uploader never handed us.
    const { contentHash, bytes } = isRaw
      ? {
          contentHash: this.hashService.hash(input.rawContent!),
          bytes: input.rawContent!,
        }
      : (() => {
          const hashed = this.hashService.hashCanonicalJson(input.content!);
          return {
            contentHash: hashed.contentHash,
            bytes: Buffer.from(hashed.canonicalBytes, 'utf-8'),
          };
        })();

    const objectKey = this.storageService.buildObjectKey(
      input.tenantId,
      evidenceId,
    );
    await this.storageService.putObject(
      objectKey,
      bytes,
      mediaType,
      input.retentionProfile ?? 'STANDARD',
    );

    const signature = await this.collectorSignature.sign({
      contentHash,
      tenantId: input.tenantId,
      sourceSystemId: input.sourceSystemId,
      evidenceType: input.evidenceType,
      sourceObservedAt: input.sourceObservedAt,
      collectorId: input.collectorId,
      collectorVersion: input.collectorVersion,
    });

    try {
      const evidence = await this.prisma.$transaction(
        async (tx) => {
          if (input.caseId) {
            const caseRecord = await tx.case.findFirst({
              where: { id: input.caseId, tenant_id: input.tenantId },
              select: { id: true },
            });
            if (!caseRecord) {
              throw new NotFoundException(`Case '${input.caseId}' not found`);
            }
          }

          const created = await tx.evidenceRecord.create({
            data: {
              id: evidenceId,
              tenant_id: input.tenantId,
              environment_id: requireEnvironmentId(input.environmentId),
              legal_entity_id: input.legalEntityId,
              region: requireRegion(input.region),
              evidence_type: input.evidenceType,
              producing_service: input.producingService,
              source_system_id: input.sourceSystemId,
              source_object_id: input.sourceObjectId,
              collector_id: input.collectorId,
              collector_version: input.collectorVersion,
              source_observed_at: input.sourceObservedAt,
              period_start: input.periodStart,
              period_end: input.periodEnd,
              purpose: input.purpose,
              data_class: input.dataClass ?? 'INTERNAL',
              content_hash: contentHash,
              hash_algorithm: 'SHA-256',
              media_type: mediaType,
              size_bytes: bytes.byteLength,
              vault_reference: objectKey,
              // We just wrote and hashed the bytes ourselves — that's not the
              // same claim as "independently re-verified from storage" (spec
              // §27). integrity_state flips to VERIFIED only via verify().
              integrity_state: 'PENDING',
              freshness_state: 'CURRENT',
              completeness_state: 'UNKNOWN',
              retention_profile: input.retentionProfile ?? 'STANDARD',
              collection_method: input.collectionMethod ?? 'AUTOMATED',
              uploader_identity: input.uploaderIdentity,
              upload_reason: input.uploadReason,
              manual_review_required: input.manualReviewRequired ?? false,
              expires_at: input.expiresAt,
              collector_signature: signature?.signature,
              collector_signing_key_id: signature?.signingKeyId,
              collector_nonce: signature?.nonce,
            },
          });
          await tx.outboxEvent.create({
            data: this.outbox.build({
              tenantId: input.tenantId,
              topic: EVIDENCE_TOPICS.EVIDENCE_COLLECTED,
              eventType: 'evidence.collected',
              payload: {
                evidenceId,
                evidenceType: input.evidenceType,
                sourceSystemId: input.sourceSystemId,
              },
            }),
          });

          if (input.parentEvidenceId) {
            const parent = await tx.evidenceRecord.findFirst({
              where: { id: input.parentEvidenceId, tenant_id: input.tenantId },
              select: { id: true },
            });
            if (!parent)
              throw new Error('Parent evidence does not belong to this tenant');
            await tx.evidenceLineage.create({
              data: {
                tenant_id: input.tenantId,
                evidence_id: evidenceId,
                parent_evidence_id: input.parentEvidenceId,
                relationship: input.lineageRelationship ?? 'DERIVED_FROM',
              },
            });
          }

          await this.ledgerService.appendInTransaction(
            tx,
            input.tenantId,
            evidenceId,
            {
              evidenceType: input.evidenceType,
              contentHash,
              sourceSystemId: input.sourceSystemId,
            },
          );

          if (input.caseId) {
            await tx.caseEvidence.create({
              data: {
                tenant_id: input.tenantId,
                case_id: input.caseId,
                evidence_id: evidenceId,
                added_by: input.addedBy ?? 'system',
              },
            });
            await tx.caseTimelineEntry.create({
              data: {
                tenant_id: input.tenantId,
                case_id: input.caseId,
                entry_type: 'EVIDENCE_LINKED',
                actor_id: input.addedBy ?? 'system',
                title: 'Evidence Linked',
                summary: `Linked evidence '${evidenceId}'`,
                evidence_ref: evidenceId,
              },
            });
          }
          return created;
        },
        { isolationLevel: 'Serializable' },
      );

      this.logger.log(
        `Evidence ${evidence.id} created for tenant ${input.tenantId} (${input.evidenceType})`,
      );
      return evidence;
    } catch (error) {
      await this.storageService
        .deleteObject(objectKey)
        .catch((cleanupError) => {
          this.logger.error(
            `Failed to clean up orphaned evidence object '${objectKey}': ${String(cleanupError)}`,
          );
        });
      throw error;
    }
  }

  /**
   * Clears the review flag on human-submitted evidence. The reviewer may not
   * be the uploader — self-attested manual evidence is exactly what the
   * review requirement exists to catch.
   */
  async recordManualReview(params: {
    tenantId: string;
    evidenceId: string;
    reviewerId: string;
    comments?: string;
  }) {
    const evidence = await this.getById(params.tenantId, params.evidenceId);

    if (evidence.collection_method !== 'MANUAL') {
      throw new BadRequestException(
        `Evidence '${params.evidenceId}' was not manually submitted and does not need manual review`,
      );
    }
    if (evidence.uploader_identity === params.reviewerId) {
      throw new ForbiddenException(
        `Reviewer '${params.reviewerId}' cannot review evidence they uploaded themselves`,
      );
    }

    return this.prisma.evidenceRecord.update({
      where: { id: params.evidenceId },
      data: {
        manual_review_required: false,
        manual_reviewed_by: params.reviewerId,
        manual_reviewed_at: new Date(),
        upload_reason: params.comments
          ? `${evidence.upload_reason ?? ''} | review: ${params.comments}`
          : evidence.upload_reason,
      },
    });
  }

  async getById(tenantId: string, evidenceId: string) {
    const evidence = await this.evidenceRepository.findByTenantAndId(
      tenantId,
      evidenceId,
    );
    if (!evidence) {
      throw new NotFoundException(`Evidence '${evidenceId}' not found`);
    }
    return evidence;
  }

  /** Throws if the evidence belongs to a different tenant — never returns cross-tenant data, even to signal "not found" vs "forbidden" differently (spec: cross-tenant evidence access rejected). */
  async assertTenantOwnership(tenantId: string, evidenceId: string) {
    const evidence = await this.evidenceRepository.findById(evidenceId);
    if (!evidence) {
      throw new NotFoundException(`Evidence '${evidenceId}' not found`);
    }
    if (evidence.tenant_id !== tenantId) {
      throw new ForbiddenException(
        `Evidence '${evidenceId}' does not belong to this tenant`,
      );
    }
    return evidence;
  }
}
