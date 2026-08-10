import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceLedgerService } from '../ledger/evidence-ledger.service';
import { EvidenceLineageService } from '../lineage/evidence-lineage.service';
import { EvidenceRepository } from '../repositories/evidence.repository';
import { EVIDENCE_TOPICS } from '../events/evidence-events';

export interface CreateEvidenceInput {
  tenantId: string;
  environmentId?: string;
  legalEntityId?: string;
  region?: string;
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
  content: Record<string, unknown>;
  mediaType?: string;
  retentionProfile?: string;
  parentEvidenceId?: string;
  lineageRelationship?: string;
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
  ) {}

  async createEvidence(input: CreateEvidenceInput) {
    const evidenceId = randomUUID();
    const mediaType = input.mediaType ?? 'application/json';
    const { contentHash, canonicalBytes } = this.hashService.hashCanonicalJson(input.content);

    const objectKey = this.storageService.buildObjectKey(input.tenantId, evidenceId);
    await this.storageService.putObject(objectKey, Buffer.from(canonicalBytes, 'utf-8'), mediaType);

    const [evidence] = await this.prisma.$transaction([
      this.prisma.evidenceRecord.create({
        data: {
          id: evidenceId,
          tenant_id: input.tenantId,
          environment_id: input.environmentId ?? 'default-env',
          legal_entity_id: input.legalEntityId,
          region: input.region ?? 'unspecified',
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
          size_bytes: Buffer.byteLength(canonicalBytes, 'utf-8'),
          vault_reference: objectKey,
          // We just wrote and hashed the bytes ourselves — that's not the
          // same claim as "independently re-verified from storage" (spec
          // §27). integrity_state flips to VERIFIED only via verify().
          integrity_state: 'PENDING',
          freshness_state: 'CURRENT',
          completeness_state: 'UNKNOWN',
          retention_profile: input.retentionProfile ?? 'STANDARD',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: input.tenantId,
          topic: EVIDENCE_TOPICS.EVIDENCE_COLLECTED,
          eventType: 'evidence.collected',
          payload: { evidenceId, evidenceType: input.evidenceType, sourceSystemId: input.sourceSystemId },
        }),
      }),
    ]);

    if (input.parentEvidenceId) {
      await this.lineageService.link({
        tenantId: input.tenantId,
        evidenceId,
        parentEvidenceId: input.parentEvidenceId,
        relationship: input.lineageRelationship ?? 'DERIVED_FROM',
      });
    }

    await this.ledgerService.append(input.tenantId, evidenceId, {
      evidenceType: input.evidenceType,
      contentHash,
      sourceSystemId: input.sourceSystemId,
    });

    this.logger.log(`Evidence ${evidence.id} created for tenant ${input.tenantId} (${input.evidenceType})`);
    return evidence;
  }

  async getById(tenantId: string, evidenceId: string) {
    const evidence = await this.evidenceRepository.findByTenantAndId(tenantId, evidenceId);
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
      throw new ForbiddenException(`Evidence '${evidenceId}' does not belong to this tenant`);
    }
    return evidence;
  }
}
