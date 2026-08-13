import { Injectable, Logger } from '@nestjs/common';
import { AssetRepository } from './asset.repository';
import { ResolveAssetInput, ResolvedAsset } from './asset.types';
import { requireEnvironmentId } from '../../../tenant-context';

/**
 * Alias-based asset resolution (spec §6/§11). A matching hostname alone is
 * never sufficient to merge two assets — resolution always goes through the
 * (tenant, sourceSystem, sourceAccountId, externalType, externalId) alias
 * key, same pattern as identity resolution.
 */
@Injectable()
export class AssetResolutionService {
  private readonly logger = new Logger(AssetResolutionService.name);

  constructor(private readonly repo: AssetRepository) {}

  async resolve(input: ResolveAssetInput): Promise<ResolvedAsset> {
    const observedAt = input.observedAt ?? new Date();
    const environmentId = requireEnvironmentId(input.environmentId);

    const existingAlias = await this.repo.findAliasByKey(
      input.tenantId,
      input.sourceSystem,
      input.sourceAccountId,
      input.externalType,
      input.externalId,
    );

    if (existingAlias) {
      await this.repo.touchAlias(existingAlias.id, observedAt);
      await this.repo.touchAsset(existingAlias.asset_id, observedAt);
      await this.repo.recordDecision({
        tenantId: input.tenantId,
        entityType: 'ASSET',
        sourceSystem: input.sourceSystem,
        externalId: input.externalId,
        resolvedEntityId: existingAlias.asset_id,
        decision: 'MATCHED',
        confidence: 1.0,
        reason: 'Exact trusted alias match on (tenant, sourceSystem, sourceAccountId, externalType, externalId)',
      });
      return { assetId: existingAlias.asset_id, decision: 'MATCHED' };
    }

    const asset = await this.repo.createAsset({
      tenantId: input.tenantId,
      environmentId,
      externalId: input.externalId,
      assetType: input.assetType,
      name: input.hostname || input.displayName || input.externalId,
      criticality: input.criticality || 'MEDIUM',
    });

    await this.repo.createAlias({
      tenantId: input.tenantId,
      assetId: asset.id,
      sourceSystem: input.sourceSystem,
      sourceAccountId: input.sourceAccountId,
      externalType: input.externalType,
      externalId: input.externalId,
      observedAt,
    });

    await this.repo.recordDecision({
      tenantId: input.tenantId,
      entityType: 'ASSET',
      sourceSystem: input.sourceSystem,
      externalId: input.externalId,
      resolvedEntityId: asset.id,
      decision: 'CREATED',
      confidence: 1.0,
      reason: 'No existing alias for this (tenant, sourceSystem, externalType, externalId) — created new canonical asset',
    });

    this.logger.log(`Created asset ${asset.id} for tenant ${input.tenantId}`);
    return { assetId: asset.id, decision: 'CREATED' };
  }
}
