import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type IngestRegion = 'eu-west-1' | 'us-east-1' | 'ap-southeast-1';

export interface RegionalShardNode {
  region: IngestRegion;
  endpoint: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  activeConnections: number;
  replicationLagMs: number;
}

export interface ShardedIngestRoutingDecision {
  tenantId: string;
  primaryRegion: IngestRegion;
  routedRegion: IngestRegion;
  isFailover: boolean;
  failoverReason?: string;
  endpoint: string;
  partitionHash: string;
}

/**
 * Multi-Region Active-Active Ingestion Shard Service
 * Provides consistent hash-based shard routing, cross-region replication lag tracking,
 * and automatic failover for high-throughput multi-cloud telemetry ingestion.
 */
@Injectable()
export class MultiRegionIngestShardService {
  private readonly logger = new Logger(MultiRegionIngestShardService.name);

  private readonly shards: Map<IngestRegion, RegionalShardNode> = new Map([
    [
      'eu-west-1',
      {
        region: 'eu-west-1',
        endpoint: 'https://ingest-eu.zoikoshield.internal',
        status: 'HEALTHY',
        activeConnections: 120,
        replicationLagMs: 12,
      },
    ],
    [
      'us-east-1',
      {
        region: 'us-east-1',
        endpoint: 'https://ingest-us.zoikoshield.internal',
        status: 'HEALTHY',
        activeConnections: 150,
        replicationLagMs: 18,
      },
    ],
    [
      'ap-southeast-1',
      {
        region: 'ap-southeast-1',
        endpoint: 'https://ingest-ap.zoikoshield.internal',
        status: 'HEALTHY',
        activeConnections: 85,
        replicationLagMs: 24,
      },
    ],
  ]);

  private readonly failoverFallbackMap: Record<IngestRegion, IngestRegion> = {
    'eu-west-1': 'us-east-1',
    'us-east-1': 'eu-west-1',
    'ap-southeast-1': 'us-east-1',
  };

  /**
   * Computes the primary region shard via deterministic consistent hashing of the tenant ID.
   */
  getPrimaryRegionForTenant(tenantId: string): IngestRegion {
    const hash = crypto.createHash('md5').update(tenantId).digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    const regions: IngestRegion[] = [
      'eu-west-1',
      'us-east-1',
      'ap-southeast-1',
    ];
    return regions[hashNum % regions.length];
  }

  /**
   * Routes an incoming ingestion stream payload to the optimal active region shard.
   */
  routeIngestStream(tenantId: string): ShardedIngestRoutingDecision {
    const primaryRegion = this.getPrimaryRegionForTenant(tenantId);
    const primaryShard = this.shards.get(primaryRegion)!;
    const partitionHash = crypto
      .createHash('sha256')
      .update(`${tenantId}:${primaryRegion}`)
      .digest('hex');

    if (primaryShard.status === 'HEALTHY') {
      return {
        tenantId,
        primaryRegion,
        routedRegion: primaryRegion,
        isFailover: false,
        endpoint: primaryShard.endpoint,
        partitionHash,
      };
    }

    // Failover required
    const fallbackRegion = this.failoverFallbackMap[primaryRegion];
    const fallbackShard = this.shards.get(fallbackRegion)!;

    this.logger.warn(
      `⚠️ [INGEST REGION FAILOVER] Primary '${primaryRegion}' is ${primaryShard.status}. Re-routing tenant '${tenantId}' ➔ '${fallbackRegion}'`,
    );

    return {
      tenantId,
      primaryRegion,
      routedRegion: fallbackRegion,
      isFailover: true,
      failoverReason: `Primary region ${primaryRegion} is ${primaryShard.status} (Replication lag: ${primaryShard.replicationLagMs}ms)`,
      endpoint: fallbackShard.endpoint,
      partitionHash,
    };
  }

  /**
   * Updates health status and replication lag of a regional shard.
   */
  updateShardHealth(
    region: IngestRegion,
    status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE',
    replicationLagMs: number,
  ): void {
    const shard = this.shards.get(region);
    if (shard) {
      shard.status = status;
      shard.replicationLagMs = replicationLagMs;
      this.logger.log(
        `✔ [REGION SHARD STATUS UPDATED] ${region} -> Status: ${status}, Lag: ${replicationLagMs}ms`,
      );
    }
  }

  getAllShardNodes(): RegionalShardNode[] {
    return Array.from(this.shards.values());
  }
}
