import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  requireEnvironmentId,
  requireTenantId,
} from '../security/tenant-context';
import { EvidenceService as CanonicalEvidenceService } from '../../../shield-core/src/modules/evidence/services/evidence.service';
import { EvidenceVerificationService } from '../../../shield-core/src/modules/evidence/verification/evidence-verification.service';

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
    private readonly canonicalEvidence: CanonicalEvidenceService,
    private readonly verification: EvidenceVerificationService,
  ) {}

  /**
   * Create an evidence record with cryptographic SHA-256 hash calculation
   */
  async createEvidence(dto: CreateEvidenceDto) {
    if (!dto.title || dto.title.trim().length === 0) {
      throw new BadRequestException('Evidence title is required');
    }

    if (!dto.rawContent || dto.rawContent.trim().length === 0) {
      throw new BadRequestException('Evidence rawContent cannot be empty');
    }

    const tenantId = requireTenantId(dto.tenantId);
    return this.canonicalEvidence.createEvidence({
      tenantId,
      environmentId: requireEnvironmentId(dto.environmentId),
      legalEntityId: dto.legalEntityId,
      region: dto.region,
      evidenceType: dto.evidenceType,
      producingService: 'shield-ingest',
      sourceSystemId: 'ingest-api',
      sourceObjectId: dto.title,
      purpose: dto.description || dto.title,
      retentionProfile: dto.retentionDays
        ? `${dto.retentionDays}_DAYS`
        : undefined,
      caseId: dto.caseId,
      addedBy: dto.createdBy,
      content: {
        title: dto.title,
        fileName: dto.fileName,
        rawContent: dto.rawContent,
      },
    });
  }

  /**
   * Get evidence record by ID
   */
  async getEvidenceById(tenantId: string, id: string) {
    return this.canonicalEvidence.getById(tenantId, id);
  }

  /**
   * Query evidence records for a tenant
   */
  async getEvidenceByTenant(tenantId: string, caseId?: string) {
    return this.prisma.evidenceRecord.findMany({
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
    const result = await this.verification.verify(tenantId, id);
    return {
      evidenceId: id,
      storedHash: result.contentHash,
      recomputedHash: result.storedHash,
      isIntegrityValid: result.integrityState === 'VERIFIED',
      integrityState: result.integrityState,
      verifiedAt: new Date(),
    };
  }
}
