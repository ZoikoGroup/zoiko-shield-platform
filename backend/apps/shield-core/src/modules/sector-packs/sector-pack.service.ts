import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateSectorPackDto {
  @IsString()
  packKey!: string;

  @IsString()
  jurisdiction!: string;

  @IsOptional()
  @IsArray()
  requiredConnectors?: string[];

  @IsOptional()
  @IsString()
  approvedClaimWording?: string;
}

export class SetMarketAvailabilityDto {
  @IsString()
  region!: string;

  @IsBoolean()
  available!: boolean;
}

/**
 * ZS-COM-BILL-001 REG-01: a sector pack is a support capability, never an
 * implied certification. It only becomes usable — for claims, for
 * regional availability — once both its content license and release are
 * approved; unsupported region/pack combinations fail closed rather than
 * defaulting to available.
 */
@Injectable()
export class SectorPackService {
  private readonly logger = new Logger(SectorPackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createPack(dto: CreateSectorPackDto) {
    const latest = await this.prisma.sectorPack.findFirst({
      where: { pack_key: dto.packKey },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.sectorPack.create({
      data: {
        pack_key: dto.packKey,
        version,
        jurisdiction: dto.jurisdiction,
        required_connectors: JSON.stringify(dto.requiredConnectors || []),
        approved_claim_wording: dto.approvedClaimWording,
        content_license_status: 'PENDING',
        release_status: 'DRAFT',
      },
    });
  }

  async licenseContent(packId: string) {
    const pack = await this.prisma.sectorPack.findUnique({ where: { id: packId } });
    if (!pack) {
      throw new NotFoundException(`Sector pack '${packId}' not found`);
    }
    return this.prisma.sectorPack.update({ where: { id: packId }, data: { content_license_status: 'LICENSED' } });
  }

  async approveRelease(packId: string, approvedBy: string) {
    const pack = await this.prisma.sectorPack.findUnique({ where: { id: packId } });
    if (!pack) {
      throw new NotFoundException(`Sector pack '${packId}' not found`);
    }
    if (pack.content_license_status !== 'LICENSED') {
      throw new ConflictException({
        statusCode: 409,
        error: 'PACK_CONTENT_NOT_LICENSED',
        message: `Sector pack '${packId}' content is '${pack.content_license_status}', not LICENSED — cannot approve release`,
      });
    }
    if (pack.release_status !== 'DRAFT') {
      throw new ConflictException(`Sector pack '${packId}' release is '${pack.release_status}', not DRAFT`);
    }

    return this.prisma.sectorPack.update({
      where: { id: packId },
      data: { release_status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async setMarketAvailability(packId: string, dto: SetMarketAvailabilityDto) {
    return this.prisma.marketAvailability.upsert({
      where: { sector_pack_id_region: { sector_pack_id: packId, region: dto.region } },
      update: { available: dto.available },
      create: { sector_pack_id: packId, region: dto.region, available: dto.available },
    });
  }

  /**
   * Fail-closed: returns false unless the pack is APPROVED, its content is
   * LICENSED, and the region is explicitly marked available. No implicit
   * "available everywhere" default.
   */
  async isAvailable(packKey: string, region: string): Promise<boolean> {
    const pack = await this.prisma.sectorPack.findFirst({
      where: { pack_key: packKey, release_status: 'APPROVED', content_license_status: 'LICENSED' },
      orderBy: { version: 'desc' },
    });
    if (!pack) {
      this.logger.warn(`Sector pack availability FAILED CLOSED for '${packKey}' (not approved/licensed)`);
      return false;
    }

    const availability = await this.prisma.marketAvailability.findUnique({
      where: { sector_pack_id_region: { sector_pack_id: pack.id, region } },
    });
    return availability?.available === true;
  }

  /** Never invents claim wording — null unless the pack is fully approved/licensed. */
  async getApprovedClaimWording(packKey: string, region: string): Promise<string | null> {
    const available = await this.isAvailable(packKey, region);
    if (!available) {
      return null;
    }
    const pack = await this.prisma.sectorPack.findFirst({
      where: { pack_key: packKey, release_status: 'APPROVED' },
      orderBy: { version: 'desc' },
    });
    return pack?.approved_claim_wording || null;
  }
}
