import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContextHealth } from './context.types';

const RESOLVER_VERSION = '1.0';

/**
 * Builds the immutable ContextSnapshot a detection evaluation replays
 * against later (spec §13). Connector health arrives as `sourceHealthState`
 * on the event.normalized.v1 payload — shield-core never reads
 * ConnectorHealthStatus directly, since that table is shield-ingest-owned
 * (connectors domain) and this app must consume the canonical event
 * contract instead of treating another app's tables as its API.
 */
@Injectable()
export class ContextSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async build(params: {
    tenantId: string;
    environmentId: string;
    eventId: string;
    sourceHealthState: string;
    identityEntityId?: string;
    assetId?: string;
  }) {
    const sourceDegraded =
      !!params.sourceHealthState &&
      params.sourceHealthState !== 'HEALTHY' &&
      params.sourceHealthState !== 'CONNECTED' &&
      params.sourceHealthState !== 'SYNCING';

    const contextHealth = this.deriveContextHealth({
      hasIdentity: !!params.identityEntityId,
      hasAsset: !!params.assetId,
      sourceDegraded,
    });

    const snapshot = await this.prisma.contextSnapshot.create({
      data: {
        tenant_id: params.tenantId,
        environment_id: params.environmentId,
        event_id: params.eventId,
        identity_entity_id: params.identityEntityId,
        asset_id: params.assetId,
        relationship_refs: '[]',
        source_versions: JSON.stringify({ connectorHealthState: params.sourceHealthState ?? 'UNKNOWN' }),
        resolver_version: RESOLVER_VERSION,
        context_health: contextHealth,
      },
    });

    return { snapshotId: snapshot.id, contextHealth: contextHealth as ContextHealth };
  }

  private deriveContextHealth(input: { hasIdentity: boolean; hasAsset: boolean; sourceDegraded: boolean }): ContextHealth {
    if (!input.hasIdentity && !input.hasAsset) return 'UNRESOLVED';
    if (input.sourceDegraded) return 'PARTIAL';
    if (!input.hasIdentity || !input.hasAsset) return 'PARTIAL';
    return 'RESOLVED';
  }
}
