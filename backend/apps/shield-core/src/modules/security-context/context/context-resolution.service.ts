import { Injectable, Logger } from '@nestjs/common';
import { IdentityResolutionService } from '../identities/identity-resolution.service';
import { AssetResolutionService } from '../assets/asset-resolution.service';
import { RelationshipService } from '../relationship/relationship.service';
import { ContextSnapshotService } from './context-snapshot.service';
import { ResolvedContext, NormalizedEventContract } from './context.types';

/**
 * Orchestrates identity + asset + relationship resolution and builds a
 * ContextSnapshot, driven entirely by the consumed event.normalized.v1
 * payload (spec §14/§38) — no read of, and no write to, the
 * shield-ingest-owned NormalizedEvent table. Writes only shield-core-owned
 * state (IdentityEntity/IdentityAlias/Asset/AssetAlias/Relationship/
 * ResolutionDecision/ContextSnapshot). ContextSnapshot.event_id retains
 * the normalizedEventId purely as a lineage reference.
 */
@Injectable()
export class ContextResolutionService {
  private readonly logger = new Logger(ContextResolutionService.name);

  constructor(
    private readonly identityResolution: IdentityResolutionService,
    private readonly assetResolution: AssetResolutionService,
    private readonly relationshipService: RelationshipService,
    private readonly snapshotService: ContextSnapshotService,
  ) {}

  async resolveFromEvent(payload: NormalizedEventContract): Promise<ResolvedContext> {
    const observedAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();

    let identityEntityId: string | undefined;
    if (payload.actorEmail || payload.actorUserId) {
      const resolved = await this.identityResolution.resolve({
        tenantId: payload.tenantId,
        environmentId: payload.environmentId,
        sourceSystem: payload.sourceSystem,
        sourceAccountId: payload.connectorId,
        externalType: payload.actorUserId ? 'OBJECT_ID' : 'EMAIL',
        externalId: payload.actorUserId || payload.actorEmail!,
        email: payload.actorEmail || undefined,
        identityType: 'HUMAN',
        observedAt,
      });
      identityEntityId = resolved.identityEntityId;
    }

    let assetId: string | undefined;
    const resourceId = payload.resourceId || payload.sourceIp;
    if (resourceId) {
      const assetType = payload.resourceType || (payload.sourceIp ? 'IP' : 'CLOUD_RESOURCE');
      const resolved = await this.assetResolution.resolve({
        tenantId: payload.tenantId,
        environmentId: payload.environmentId,
        sourceSystem: payload.sourceSystem,
        sourceAccountId: payload.connectorId,
        externalType: payload.sourceIp ? 'IP_ADDRESS' : 'RESOURCE_ID',
        externalId: resourceId,
        assetType,
        hostname: payload.sourceIp ? undefined : resourceId,
        observedAt,
      });
      assetId = resolved.assetId;
    }

    if (identityEntityId && assetId) {
      await this.relationshipService.upsert({
        tenantId: payload.tenantId,
        environmentId: payload.environmentId,
        subjectType: 'IDENTITY',
        subjectId: identityEntityId,
        relation: 'SIGNED_IN_TO',
        objectType: 'ASSET',
        objectId: assetId,
        source: payload.sourceSystem,
        observedAt,
      });
    }

    const { snapshotId, contextHealth } = await this.snapshotService.build({
      tenantId: payload.tenantId,
      environmentId: payload.environmentId,
      eventId: payload.normalizedEventId,
      sourceHealthState: payload.sourceHealthState,
      identityEntityId,
      assetId,
    });

    this.logger.debug(
      `Resolved context for event ${payload.normalizedEventId}: identity=${identityEntityId ?? 'none'} asset=${assetId ?? 'none'} health=${contextHealth}`,
    );

    return { eventId: payload.normalizedEventId, identityEntityId, assetId, contextSnapshotId: snapshotId, contextHealth };
  }
}
