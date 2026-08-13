import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requireEnvironmentId } from '../security/tenant-context';

export interface ResolveAssetDto {
  tenantId: string;
  environmentId?: string;
  externalId: string;
  assetType: string; // e.g. 'HOST', 'IP', 'CLOUD_RESOURCE', 'APPLICATION'
  name?: string;
  criticality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ResolveIdentityDto {
  tenantId: string;
  externalId?: string;
  email?: string;
  displayName?: string;
  identityType?: 'USER' | 'SERVICE_ACCOUNT' | 'SYSTEM_ROLE';
}

@Injectable()
export class AssetIdentityContextService {
  private readonly logger = new Logger(AssetIdentityContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves an existing asset or creates a new tenant-scoped asset, updating last_seen_at.
   */
  async resolveAsset(dto: ResolveAssetDto) {
    const environmentId = requireEnvironmentId(dto.environmentId);
    const criticality = dto.criticality || 'MEDIUM';
    const name = dto.name || dto.externalId;

    const existing = await this.prisma.asset.findFirst({
      where: {
        tenant_id: dto.tenantId,
        external_id: dto.externalId,
        asset_type: dto.assetType,
      },
    });

    if (existing) {
      this.logger.debug(
        `Updating last_seen_at for asset ${existing.id} (${existing.name})`,
      );
      return this.prisma.asset.update({
        where: { id: existing.id },
        data: { last_seen_at: new Date() },
      });
    }

    this.logger.log(
      `Creating new ${dto.assetType} asset '${name}' for tenant ${dto.tenantId}`,
    );
    return this.prisma.asset.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: environmentId,
        external_id: dto.externalId,
        asset_type: dto.assetType,
        name,
        criticality,
        status: 'ACTIVE',
        first_seen_at: new Date(),
        last_seen_at: new Date(),
      },
    });
  }

  /**
   * Resolves an existing identity entity or creates a new tenant-scoped identity, updating last_seen_at.
   */
  async resolveIdentity(dto: ResolveIdentityDto) {
    if (!dto.email && !dto.externalId) {
      return null;
    }

    const email = dto.email ? dto.email.toLowerCase() : undefined;

    let existing = null;

    if (email) {
      existing = await this.prisma.identityEntity.findFirst({
        where: { tenant_id: dto.tenantId, email },
      });
    }

    if (!existing && dto.externalId) {
      existing = await this.prisma.identityEntity.findFirst({
        where: { tenant_id: dto.tenantId, external_id: dto.externalId },
      });
    }

    if (existing) {
      this.logger.debug(
        `Updating last_seen_at for identity ${existing.id} (${existing.email || existing.external_id})`,
      );
      return this.prisma.identityEntity.update({
        where: { id: existing.id },
        data: { last_seen_at: new Date() },
      });
    }

    this.logger.log(
      `Creating new identity entity '${email || dto.externalId}' for tenant ${dto.tenantId}`,
    );
    return this.prisma.identityEntity.create({
      data: {
        tenant_id: dto.tenantId,
        external_id: dto.externalId,
        email,
        display_name: dto.displayName || email || dto.externalId,
        identity_type: dto.identityType || 'USER',
        first_seen_at: new Date(),
        last_seen_at: new Date(),
      },
    });
  }

  /**
   * Processes a normalized event, resolving and linking asset and identity context.
   */
  async processNormalizedEventContext(normalizedEventId: string) {
    const event = await this.prisma.normalizedEvent.findUnique({
      where: { id: normalizedEventId },
    });

    if (!event) {
      throw new NotFoundException(
        `Normalized event '${normalizedEventId}' not found`,
      );
    }

    let assetId: string | undefined;
    let identityId: string | undefined;

    // Resolve Asset if resource_id or source_ip exists
    const resourceId = event.resource_id || event.source_ip;
    if (resourceId) {
      const assetType =
        event.resource_type || (event.source_ip ? 'IP' : 'CLOUD_RESOURCE');
      const resolvedAsset = await this.resolveAsset({
        tenantId: event.tenant_id,
        environmentId: event.environment_id,
        externalId: resourceId,
        assetType,
        name: resourceId,
      });
      assetId = resolvedAsset.id;
    }

    // Resolve Identity if actor_email or actor_user_id exists
    if (event.actor_email || event.actor_user_id) {
      const resolvedIdentity = await this.resolveIdentity({
        tenantId: event.tenant_id,
        externalId: event.actor_user_id || undefined,
        email: event.actor_email || undefined,
      });
      if (resolvedIdentity) {
        identityId = resolvedIdentity.id;
      }
    }

    // Link asset & identity back to NormalizedEvent
    if (assetId || identityId) {
      await this.prisma.normalizedEvent.update({
        where: { id: normalizedEventId },
        data: {
          asset_id: assetId,
          identity_id: identityId,
        },
      });
    }

    return {
      eventId: normalizedEventId,
      assetId,
      identityId,
    };
  }

  /**
   * Get assets for tenant
   */
  async getAssets(tenantId: string, limit = 50) {
    return this.prisma.asset.findMany({
      where: { tenant_id: tenantId },
      take: limit,
      orderBy: { last_seen_at: 'desc' },
    });
  }

  /**
   * Get single asset details
   */
  async getAssetById(tenantId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenant_id: tenantId },
      include: {
        normalizedEvents: { take: 10, orderBy: { recorded_at: 'desc' } },
      },
    });

    if (!asset) {
      throw new NotFoundException(`Asset '${assetId}' not found`);
    }

    return asset;
  }

  /**
   * Get identity entities for tenant
   */
  async getIdentities(tenantId: string, limit = 50) {
    return this.prisma.identityEntity.findMany({
      where: { tenant_id: tenantId },
      take: limit,
      orderBy: { last_seen_at: 'desc' },
    });
  }

  /**
   * Get single identity details
   */
  async getIdentityById(tenantId: string, identityId: string) {
    const identity = await this.prisma.identityEntity.findFirst({
      where: { id: identityId, tenant_id: tenantId },
      include: {
        normalizedEvents: { take: 10, orderBy: { recorded_at: 'desc' } },
      },
    });

    if (!identity) {
      throw new NotFoundException(`Identity entity '${identityId}' not found`);
    }

    return identity;
  }
}
