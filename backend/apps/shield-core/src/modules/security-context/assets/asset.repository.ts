import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAliasByKey(
    tenantId: string,
    sourceSystem: string,
    sourceAccountId: string | undefined,
    externalType: string,
    externalId: string,
  ) {
    return this.prisma.assetAlias.findUnique({
      where: {
        tenant_id_source_system_source_account_id_external_type_external_id: {
          tenant_id: tenantId,
          source_system: sourceSystem,
          source_account_id: sourceAccountId ?? null,
          external_type: externalType,
          external_id: externalId,
        } as any,
      },
      include: { asset: true },
    });
  }

  createAsset(data: {
    tenantId: string;
    environmentId: string;
    externalId: string;
    assetType: string;
    name: string;
    criticality: string;
  }) {
    return this.prisma.asset.create({
      data: {
        tenant_id: data.tenantId,
        environment_id: data.environmentId,
        external_id: data.externalId,
        asset_type: data.assetType,
        name: data.name,
        criticality: data.criticality,
        status: 'ACTIVE',
        first_seen_at: new Date(),
        last_seen_at: new Date(),
      },
    });
  }

  touchAsset(id: string, observedAt: Date) {
    return this.prisma.asset.update({
      where: { id },
      data: { last_seen_at: observedAt },
    });
  }

  createAlias(data: {
    tenantId: string;
    assetId: string;
    sourceSystem: string;
    sourceAccountId?: string;
    externalType: string;
    externalId: string;
    observedAt: Date;
  }) {
    return this.prisma.assetAlias.create({
      data: {
        tenant_id: data.tenantId,
        asset_id: data.assetId,
        source_system: data.sourceSystem,
        source_account_id: data.sourceAccountId,
        external_type: data.externalType,
        external_id: data.externalId,
        first_seen_at: data.observedAt,
        last_seen_at: data.observedAt,
      },
    });
  }

  touchAlias(id: string, observedAt: Date) {
    return this.prisma.assetAlias.update({
      where: { id },
      data: { last_seen_at: observedAt },
    });
  }

  recordDecision(data: {
    tenantId: string;
    entityType: string;
    sourceSystem: string;
    externalId: string;
    resolvedEntityId?: string;
    decision: string;
    confidence: number;
    reason: string;
  }) {
    return this.prisma.resolutionDecision.create({
      data: {
        tenant_id: data.tenantId,
        entity_type: data.entityType,
        source_system: data.sourceSystem,
        external_id: data.externalId,
        resolved_entity_id: data.resolvedEntityId,
        decision: data.decision,
        confidence: data.confidence,
        reason: data.reason,
      },
    });
  }
}
