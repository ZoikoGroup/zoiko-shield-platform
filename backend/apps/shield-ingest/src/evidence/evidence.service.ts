import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

export class CreateEvidenceDto {
  tenantId?: string;
  caseId?: string;
  evidenceType!: 'LOG_EXCERPT' | 'SNAPSHOT' | 'CONFIG_DUMP' | 'PCAP' | 'REPORT' | 'SIGNATURE' | 'SYSTEM_STATE';
  title!: string;
  description?: string;
  fileName?: string;
  rawContent!: string;
  retentionDays?: number;
  createdBy?: string;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    const tenantId = dto.tenantId || 'default-tenant';
    const actorId = dto.createdBy || 'system';

    // Compute cryptographic SHA-256 hash
    const sha256Hash = crypto
      .createHash('sha256')
      .update(dto.rawContent)
      .digest('hex');

    const fileSize = Buffer.byteLength(dto.rawContent, 'utf-8');

    const evidence = await this.prisma.evidenceRecord.create({
      data: {
        tenant_id: tenantId,
        case_id: dto.caseId,
        evidence_type: dto.evidenceType,
        title: dto.title,
        description: dto.description,
        file_name: dto.fileName,
        file_size_bytes: fileSize,
        sha256_hash: sha256Hash,
        raw_content: dto.rawContent,
        retention_days: dto.retentionDays || 365,
        created_by: actorId,
      },
    });

    this.logger.log(`Created EvidenceRecord '${evidence.id}' with SHA-256 '${sha256Hash}'`);

    // If linked to a Case, append EVIDENCE_LINKED event to CaseTimeline
    if (dto.caseId) {
      const caseExists = await this.prisma.case.findUnique({
        where: { id: dto.caseId },
      });

      if (caseExists) {
        await this.prisma.caseTimeline.create({
          data: {
            tenant_id: tenantId,
            case_id: dto.caseId,
            event_type: 'EVIDENCE_LINKED',
            actor_id: actorId,
            details: JSON.stringify({
              evidenceId: evidence.id,
              title: evidence.title,
              evidenceType: evidence.evidence_type,
              sha256Hash,
            }),
          },
        });
      }
    }

    return evidence;
  }

  /**
   * Get evidence record by ID
   */
  async getEvidenceById(id: string) {
    const evidence = await this.prisma.evidenceRecord.findUnique({
      where: { id },
    });

    if (!evidence) {
      throw new NotFoundException(`EvidenceRecord '${id}' not found`);
    }

    return evidence;
  }

  /**
   * Query evidence records for a tenant
   */
  async getEvidenceByTenant(tenantId: string, caseId?: string) {
    return this.prisma.evidenceRecord.findMany({
      where: {
        tenant_id: tenantId,
        ...(caseId ? { case_id: caseId } : {}),
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Verify cryptographic SHA-256 integrity hash of stored evidence
   */
  async verifyEvidenceIntegrity(id: string) {
    const evidence = await this.getEvidenceById(id);

    const recomputedHash = crypto
      .createHash('sha256')
      .update(evidence.raw_content)
      .digest('hex');

    const isValid = recomputedHash === evidence.sha256_hash;

    return {
      evidenceId: evidence.id,
      storedHash: evidence.sha256_hash,
      recomputedHash,
      isIntegrityValid: isValid,
      verifiedAt: new Date(),
    };
  }
}
