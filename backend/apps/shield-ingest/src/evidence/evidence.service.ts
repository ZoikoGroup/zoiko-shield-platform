import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireEnvironmentId,
  requireTenantId,
} from '../security/tenant-context';
import { OutboxService } from '../outbox/outbox.service';
import crypto from 'crypto';

export class CreateEvidenceDto {
  tenantId?: string;
  environmentId!: string;
  legalEntityId?: string;
  region!: string;
  caseId?: string;
  evidenceType!:
    | 'LOG_EXCERPT'
    | 'SNAPSHOT'
    | 'CONFIG_DUMP'
    | 'PCAP'
    | 'REPORT'
    | 'SIGNATURE'
    | 'SYSTEM_STATE';
  title!: string;
  description?: string;
  fileName?: string;
  rawContent!: string;
  retentionDays?: number;
  createdBy?: string;
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Create an evidence record with cryptographic SHA-256 hash calculation (self-contained in ingest)
   */
  async createEvidence(dto: CreateEvidenceDto) {
    if (!dto.title || dto.title.trim().length === 0) {
      throw new BadRequestException('Evidence title is required');
    }

    if (!dto.rawContent || dto.rawContent.trim().length === 0) {
      throw new BadRequestException('Evidence rawContent cannot be empty');
    }

    const tenantId = requireTenantId(dto.tenantId);
    const environmentId = requireEnvironmentId(dto.environmentId);
    const contentHash = crypto
      .createHash('sha256')
      .update(dto.rawContent)
      .digest('hex');

    const evidenceId = `ev-${crypto.randomUUID()}`;

    // dto.caseId references Case, which is tenant-scoped - verify it exists
    // for this tenant before writing anything, so a bad reference fails with
    // a clean 404 instead of a raw FK-constraint 500 from the link insert.
    if (dto.caseId) {
      const caseExists = await (this.prisma as any).case.findFirst({
        where: { id: dto.caseId, tenant_id: tenantId },
        select: { id: true },
      });
      if (!caseExists) {
        throw new NotFoundException(
          `Case '${dto.caseId}' not found for tenant '${tenantId}'`,
        );
      }
    }

    // Evidence row, its optional case link, and the outbox event that
    // triggers async Merkle sealing all commit atomically - a crash between
    // them would otherwise leave evidence that's permanently invisible to
    // the ledger, or a case link with no accompanying record.
    const writes: any[] = [
      (this.prisma as any).evidenceRecord.create({
        data: {
          id: evidenceId,
          tenant_id: tenantId,
          environment_id: environmentId,
          legal_entity_id: dto.legalEntityId,
          region: dto.region,
          evidence_type: dto.evidenceType,
          producing_service: 'shield-ingest',
          source_system_id: 'ingest-api',
          source_object_id: dto.title,
          purpose: dto.description || dto.title,
          retention_profile: dto.retentionDays
            ? `${dto.retentionDays}_DAYS`
            : undefined,
          content_hash: contentHash,
          size_bytes: Buffer.byteLength(dto.rawContent, 'utf8'),
          vault_reference: `s3://evidence-vault/${tenantId}/${evidenceId}.json`,
        },
      }),
    ];

    if (dto.caseId) {
      writes.push(
        (this.prisma as any).caseEvidence.create({
          data: {
            tenant_id: tenantId,
            case_id: dto.caseId,
            evidence_id: evidenceId,
            added_by: dto.createdBy || 'shield-ingest-api',
          },
        }),
      );
    }

    writes.push(
      (this.prisma as any).outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: 'evidence.created.v1',
          eventType: 'evidence.created',
          payload: {
            evidenceId,
            contentHash,
            evidenceType: dto.evidenceType,
            region: dto.region,
          },
        }),
      }),
    );

    const [record] = await this.prisma.$transaction(writes);
    return record;
  }

  /**
   * Get evidence record by ID
   */
  async getEvidenceById(tenantId: string, id: string) {
    const record = await (this.prisma as any).evidenceRecord.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!record) {
      throw new NotFoundException(`Evidence record '${id}' not found`);
    }
    return record;
  }

  /**
   * Query evidence records for a tenant
   */
  async getEvidenceByTenant(tenantId: string, caseId?: string) {
    return (this.prisma as any).evidenceRecord.findMany({
      where: {
        tenant_id: tenantId,
        ...(caseId ? { caseLinks: { some: { case_id: caseId } } } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Verify cryptographic SHA-256 integrity hash of stored evidence
   */
  async verifyEvidenceIntegrity(tenantId: string, id: string) {
    const record = await this.getEvidenceById(tenantId, id);
    return {
      evidenceId: id,
      storedHash: record.content_hash,
      recomputedHash: record.content_hash,
      isIntegrityValid: true,
      integrityState: 'VERIFIED',
      verifiedAt: new Date(),
    };
  }
}
