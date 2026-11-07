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
  /** Alias key (spec §6/§11) — see resolveAsset for why this matters. */
  sourceSystem?: string;
  sourceAccountId?: string;
  externalType?: string;
}

export interface ResolveIdentityDto {
  tenantId: string;
  externalId?: string;
  email?: string;
  displayName?: string;
  identityType?: 'USER' | 'SERVICE_ACCOUNT' | 'SYSTEM_ROLE';
  sourceSystem?: string;
  sourceAccountId?: string;
  externalType?: string;
}

/** Real @prisma/client unique-constraint violations carry this code. */
const PRISMA_UNIQUE_CONSTRAINT_ERROR = 'P2002';

@Injectable()
export class AssetIdentityContextService {
  private readonly logger = new Logger(AssetIdentityContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves an existing asset or creates a new tenant-scoped asset, updating
   * last_seen_at.
   *
   * Alias-first (spec §6/§11, same key shield-core's AssetResolutionService
   * uses): a matching (tenant, sourceSystem, sourceAccountId, externalType,
   * externalId) alias is the only trusted match. A caller that supplies none
   * of that - normalization callers always do; see processNormalizedEventContext
   * - falls back to the older bare (tenant, externalId, assetType) match so
   * rows created before aliases existed still dedupe instead of forking, and
   * backfills an alias onto them so the same source alias-matches next time.
   * Without this, an asset auto-resolved during normalization and the same
   * asset added manually through the dashboard could silently diverge into
   * two rows with no alias linking them.
   */
  async resolveAsset(dto: ResolveAssetDto) {
    const environmentId = requireEnvironmentId(dto.environmentId);
    const criticality = dto.criticality || 'MEDIUM';
    const name = dto.name || dto.externalId;
    const sourceSystem = dto.sourceSystem || 'UNKNOWN';
    const sourceAccountId = dto.sourceAccountId ?? null;
    const externalType = dto.externalType || 'EXTERNAL_ID';
    const now = new Date();

    const existingAlias = await this.prisma.assetAlias.findFirst({
      where: {
        tenant_id: dto.tenantId,
        source_system: sourceSystem,
        source_account_id: sourceAccountId,
        external_type: externalType,
        external_id: dto.externalId,
      },
    });

    if (existingAlias) {
      this.logger.debug(
        `Alias match for asset ${existingAlias.asset_id} (${sourceSystem}/${dto.externalId})`,
      );
      await this.prisma.assetAlias.update({
        where: { id: existingAlias.id },
        data: { last_seen_at: now },
      });
      return this.prisma.asset.update({
        where: { id: existingAlias.asset_id },
        data: { last_seen_at: now },
      });
    }

    const existingByBareMatch = await this.prisma.asset.findFirst({
      where: {
        tenant_id: dto.tenantId,
        external_id: dto.externalId,
        asset_type: dto.assetType,
      },
    });

    if (existingByBareMatch) {
      this.logger.debug(
        `Bare match for pre-existing asset ${existingByBareMatch.id} (${existingByBareMatch.name}); backfilling a ${sourceSystem} alias`,
      );
      await this.prisma.assetAlias
        .create({
          data: {
            tenant_id: dto.tenantId,
            asset_id: existingByBareMatch.id,
            source_system: sourceSystem,
            source_account_id: sourceAccountId,
            external_type: externalType,
            external_id: dto.externalId,
            first_seen_at: now,
            last_seen_at: now,
          },
        })
        .catch((err: any) => {
          // A concurrent resolve already created this exact alias — fine,
          // this call still reports the same asset below. Anything else
          // (e.g. a genuine write failure) should not be hidden.
          if (err?.code !== PRISMA_UNIQUE_CONSTRAINT_ERROR) throw err;
        });
      return this.prisma.asset.update({
        where: { id: existingByBareMatch.id },
        data: { last_seen_at: now },
      });
    }

    this.logger.log(
      `Creating new ${dto.assetType} asset '${name}' for tenant ${dto.tenantId}`,
    );
    const asset = await this.prisma.asset.create({
      data: {
        tenant_id: dto.tenantId,
        environment_id: environmentId,
        external_id: dto.externalId,
        asset_type: dto.assetType,
        name,
        criticality,
        status: 'ACTIVE',
        first_seen_at: now,
        last_seen_at: now,
      },
    });
    await this.prisma.assetAlias.create({
      data: {
        tenant_id: dto.tenantId,
        asset_id: asset.id,
        source_system: sourceSystem,
        source_account_id: sourceAccountId,
        external_type: externalType,
        external_id: dto.externalId,
        first_seen_at: now,
        last_seen_at: now,
      },
    });
    return asset;
  }

  /**
   * Resolves an existing identity entity or creates a new tenant-scoped
   * identity, updating last_seen_at. Same alias-first design as
   * resolveAsset; see its comment for why the bare-match fallback and
   * backfill exist.
   */
  async resolveIdentity(dto: ResolveIdentityDto) {
    if (!dto.email && !dto.externalId) {
      return null;
    }

    const email = dto.email ? dto.email.toLowerCase() : undefined;
    const sourceSystem = dto.sourceSystem || 'UNKNOWN';
    const sourceAccountId = dto.sourceAccountId ?? null;
    const externalType = dto.externalType || (dto.externalId ? 'EXTERNAL_ID' : 'EMAIL');
    const aliasExternalId = dto.externalId || email!;
    const now = new Date();

    const existingAlias = await this.prisma.identityAlias.findFirst({
      where: {
        tenant_id: dto.tenantId,
        source_system: sourceSystem,
        source_account_id: sourceAccountId,
        external_type: externalType,
        external_id: aliasExternalId,
      },
    });

    if (existingAlias) {
      this.logger.debug(
        `Alias match for identity ${existingAlias.identity_entity_id} (${sourceSystem}/${aliasExternalId})`,
      );
      await this.prisma.identityAlias.update({
        where: { id: existingAlias.id },
        data: { last_seen_at: now },
      });
      return this.prisma.identityEntity.update({
        where: { id: existingAlias.identity_entity_id },
        data: { last_seen_at: now },
      });
    }

    let existingByBareMatch = null;
    if (email) {
      existingByBareMatch = await this.prisma.identityEntity.findFirst({
        where: { tenant_id: dto.tenantId, email },
      });
    }
    if (!existingByBareMatch && dto.externalId) {
      existingByBareMatch = await this.prisma.identityEntity.findFirst({
        where: { tenant_id: dto.tenantId, external_id: dto.externalId },
      });
    }

    if (existingByBareMatch) {
      this.logger.debug(
        `Bare match for pre-existing identity ${existingByBareMatch.id} (${existingByBareMatch.email || existingByBareMatch.external_id}); backfilling a ${sourceSystem} alias`,
      );
      await this.prisma.identityAlias
        .create({
          data: {
            tenant_id: dto.tenantId,
            identity_entity_id: existingByBareMatch.id,
            source_system: sourceSystem,
            source_account_id: sourceAccountId,
            external_type: externalType,
            external_id: aliasExternalId,
            normalized_value: email,
            first_seen_at: now,
            last_seen_at: now,
          },
        })
        .catch((err: any) => {
          if (err?.code !== PRISMA_UNIQUE_CONSTRAINT_ERROR) throw err;
        });
      return this.prisma.identityEntity.update({
        where: { id: existingByBareMatch.id },
        data: { last_seen_at: now },
      });
    }

    this.logger.log(
      `Creating new identity entity '${email || dto.externalId}' for tenant ${dto.tenantId}`,
    );
    const identity = await this.prisma.identityEntity.create({
      data: {
        tenant_id: dto.tenantId,
        external_id: dto.externalId,
        email,
        display_name: dto.displayName || email || dto.externalId,
        identity_type: dto.identityType || 'USER',
        first_seen_at: now,
        last_seen_at: now,
      },
    });
    await this.prisma.identityAlias.create({
      data: {
        tenant_id: dto.tenantId,
        identity_entity_id: identity.id,
        source_system: sourceSystem,
        source_account_id: sourceAccountId,
        external_type: externalType,
        external_id: aliasExternalId,
        normalized_value: email,
        first_seen_at: now,
        last_seen_at: now,
      },
    });
    return identity;
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

    // The alias key's sourceSystem is the connector's provider (e.g. 'aws',
    // 'okta'), not the connector instance id, so two instances of the same
    // provider type share alias identity the way shield-core's manual
    // resolve does. sourceAccountId is the connector instance itself.
    const sourceSystem = await this.resolveConnectorProvider(
      event.connector_id,
    );

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
        sourceSystem,
        sourceAccountId: event.connector_id,
      });
      assetId = resolvedAsset.id;
    }

    // Resolve Identity if actor_email or actor_user_id exists
    if (event.actor_email || event.actor_user_id) {
      const resolvedIdentity = await this.resolveIdentity({
        tenantId: event.tenant_id,
        externalId: event.actor_user_id || undefined,
        email: event.actor_email || undefined,
        sourceSystem,
        sourceAccountId: event.connector_id,
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
   * The connector's provider type (e.g. 'aws-cloudtrail'), for the alias
   * key's sourceSystem. Never throws: a lookup failure (a deleted
   * connector, for instance) must not break resolving context for every
   * other event in the batch - it just produces a less specific alias.
   */
  private async resolveConnectorProvider(connectorId: string): Promise<string> {
    try {
      const instance = await this.prisma.connectorInstance.findUnique({
        where: { id: connectorId },
        select: { definition: { select: { provider: true } } },
      });
      return instance?.definition?.provider || 'UNKNOWN';
    } catch (err) {
      this.logger.warn(
        `Could not resolve provider for connector ${connectorId}: ${(err as Error).message}`,
      );
      return 'UNKNOWN';
    }
  }

  /**
   * Get assets for tenant.
   *
   * Aliases are included because W29 requires the source authority behind an
   * asset to be visible: an inventory row that cannot say which connector
   * asserted it, and whether two sources agree, is a claim rather than
   * evidence. The resolution decisions carry the reconciliation reasoning.
   */
  async getAssets(tenantId: string, limit = 50) {
    return this.prisma.asset.findMany({
      where: { tenant_id: tenantId },
      take: limit,
      orderBy: { last_seen_at: 'desc' },
      include: { aliases: true },
    });
  }

  /**
   * Resolution decisions for the asset population — the review queue behind
   * the inventory. A decision with low confidence, or one taken by an older
   * resolver version, is what a reviewer needs to see; it is not an error.
   */
  async getAssetResolutionDecisions(tenantId: string, limit = 100) {
    return this.prisma.resolutionDecision.findMany({
      where: { tenant_id: tenantId, entity_type: 'ASSET' },
      take: limit,
      orderBy: { created_at: 'desc' },
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
