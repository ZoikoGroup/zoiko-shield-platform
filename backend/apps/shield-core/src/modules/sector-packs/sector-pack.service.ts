import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

export class CreateSectorPackDto {
  @IsString()
  packKey!: string;

  @IsString()
  jurisdiction!: string;

  @IsString()
  sourceReference!: string;

  @IsString()
  sourceVersion!: string;

  @IsString()
  licenseReference!: string;

  @IsBoolean()
  displayRights!: boolean;

  @IsString()
  legalInterpretationRef!: string;

  @IsString()
  smeReviewRef!: string;

  @IsString()
  mappingTestReportRef!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredConnectors?: string[];

  @IsString()
  approvedClaimWording!: string;
}

export class SubmitSectorPackDto {
  @IsString()
  reason!: string;
}

export class DecideSectorPackDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class SetMarketAvailabilityDto {
  @IsString()
  region!: string;

  @IsBoolean()
  available!: boolean;
}

/** F1 sector-pack content authority and fail-closed regional release gate. */
@Injectable()
export class SectorPackService {
  private readonly logger = new Logger(SectorPackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private required(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`${field} must be non-empty`);
    }
    return normalized;
  }

  private async requirePack(packId: string) {
    const pack = await this.prisma.sectorPack.findUnique({
      where: { id: packId },
    });
    if (!pack) {
      throw new NotFoundException(`Sector pack '${packId}' not found`);
    }
    return pack;
  }

  private assertReleaseEvidence(
    pack: Awaited<ReturnType<SectorPackService['requirePack']>>,
  ) {
    if (
      pack.content_license_status !== 'LICENSED' ||
      !pack.display_rights ||
      pack.mapping_test_status !== 'PASSED' ||
      !pack.source_reference?.trim() ||
      !pack.source_version?.trim() ||
      !pack.license_reference?.trim() ||
      !pack.legal_interpretation_ref?.trim() ||
      !pack.sme_review_ref?.trim() ||
      !pack.mapping_test_report_ref?.trim() ||
      !pack.approved_claim_wording?.trim()
    ) {
      throw new ConflictException(
        'Sector-pack release requires approved source/version, licensing/display rights, legal and SME interpretation, mapping tests, and claim wording',
      );
    }
  }

  listPacks() {
    return this.prisma.sectorPack.findMany({
      include: { marketAvailability: true },
      orderBy: [{ pack_key: 'asc' }, { version: 'desc' }],
    });
  }

  async createPack(dto: CreateSectorPackDto, requestedBy: string) {
    if (!dto.displayRights) {
      throw new BadRequestException(
        'Sector-pack content cannot be prepared for release without display rights',
      );
    }
    const packKey = this.required(dto.packKey, 'packKey');
    const latest = await this.prisma.sectorPack.findFirst({
      where: { pack_key: packKey },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.sectorPack.create({
      data: {
        pack_key: packKey,
        version,
        jurisdiction: this.required(dto.jurisdiction, 'jurisdiction'),
        source_reference: this.required(dto.sourceReference, 'sourceReference'),
        source_version: this.required(dto.sourceVersion, 'sourceVersion'),
        content_license_status: 'LICENSED',
        license_reference: this.required(
          dto.licenseReference,
          'licenseReference',
        ),
        display_rights: true,
        legal_interpretation_ref: this.required(
          dto.legalInterpretationRef,
          'legalInterpretationRef',
        ),
        sme_review_ref: this.required(dto.smeReviewRef, 'smeReviewRef'),
        mapping_test_status: 'PASSED',
        mapping_test_report_ref: this.required(
          dto.mappingTestReportRef,
          'mappingTestReportRef',
        ),
        required_connectors: JSON.stringify(
          [...new Set(dto.requiredConnectors ?? [])].filter((value) =>
            value.trim(),
          ),
        ),
        approved_claim_wording: this.required(
          dto.approvedClaimWording,
          'approvedClaimWording',
        ),
        release_status: 'DRAFT',
        requested_by: requestedBy,
      },
    });
  }

  async submitRelease(packId: string, requestedBy: string, reason: string) {
    const pack = await this.requirePack(packId);
    if (pack.release_status !== 'DRAFT' || pack.approval_id) {
      throw new ConflictException(
        `Sector pack '${packId}' is not a DRAFT release`,
      );
    }
    this.assertReleaseEvidence(pack);
    const releaseReason = this.required(reason, 'reason');
    return this.prisma.$transaction(async (tx) => {
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'ASSURANCE_CONTENT_RELEASE',
          objectType: 'SectorPack',
          objectId: pack.id,
          requestedBy,
          reason: releaseReason,
          proposedSnapshot: {
            packKey: pack.pack_key,
            version: pack.version,
            jurisdiction: pack.jurisdiction,
            sourceReference: pack.source_reference,
            sourceVersion: pack.source_version,
            licenseReference: pack.license_reference,
            displayRights: pack.display_rights,
            legalInterpretationRef: pack.legal_interpretation_ref,
            smeReviewRef: pack.sme_review_ref,
            mappingTestReportRef: pack.mapping_test_report_ref,
            approvedClaimWording: pack.approved_claim_wording,
          },
          requiredApprovalRole: 'ASSURANCE_CONTENT_APPROVER',
        },
        tx,
      );
      return tx.sectorPack.update({
        where: { id: pack.id },
        data: {
          release_status: 'PENDING_APPROVAL',
          approval_id: approval.id,
          requested_by: requestedBy,
        },
      });
    });
  }

  async decideRelease(
    packId: string,
    approvedBy: string,
    dto: DecideSectorPackDto,
  ) {
    const pack = await this.requirePack(packId);
    if (pack.release_status !== 'PENDING_APPROVAL' || !pack.approval_id) {
      throw new ConflictException(
        `Sector pack '${packId}' has no pending release approval`,
      );
    }
    this.assertReleaseEvidence(pack);
    await this.approvals.decideApproval(
      pack.approval_id,
      approvedBy,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sectorPack.update({
        where: { id: pack.id },
        data:
          dto.decision === 'APPROVED'
            ? {
                release_status: 'APPROVED',
                approved_by: approvedBy,
                approved_at: new Date(),
              }
            : { release_status: 'REJECTED' },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: pack.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async setMarketAvailability(packId: string, dto: SetMarketAvailabilityDto) {
    const pack = await this.requirePack(packId);
    if (dto.available) {
      this.assertReleaseEvidence(pack);
      if (pack.release_status !== 'APPROVED') {
        throw new ConflictException(
          'A sector pack must be approved before a market can be enabled',
        );
      }
    }
    const region = this.required(dto.region, 'region');
    return this.prisma.marketAvailability.upsert({
      where: {
        sector_pack_id_region: { sector_pack_id: packId, region },
      },
      update: { available: dto.available },
      create: {
        sector_pack_id: packId,
        region,
        available: dto.available,
      },
    });
  }

  async isAvailable(packKey: string, region: string): Promise<boolean> {
    const pack = await this.prisma.sectorPack.findFirst({
      where: {
        pack_key: packKey,
        release_status: 'APPROVED',
        content_license_status: 'LICENSED',
        display_rights: true,
        mapping_test_status: 'PASSED',
        approved_claim_wording: { not: null },
      },
      orderBy: { version: 'desc' },
    });
    if (!pack) {
      this.logger.warn(
        `Sector pack availability FAILED CLOSED for '${packKey}' (release evidence incomplete)`,
      );
      return false;
    }

    const availability = await this.prisma.marketAvailability.findUnique({
      where: { sector_pack_id_region: { sector_pack_id: pack.id, region } },
    });
    return availability?.available === true;
  }

  async getApprovedClaimWording(
    packKey: string,
    region: string,
  ): Promise<string | null> {
    const available = await this.isAvailable(packKey, region);
    if (!available) return null;
    const pack = await this.prisma.sectorPack.findFirst({
      where: {
        pack_key: packKey,
        release_status: 'APPROVED',
        approved_claim_wording: { not: null },
      },
      orderBy: { version: 'desc' },
    });
    return pack?.approved_claim_wording?.trim() || null;
  }
}
