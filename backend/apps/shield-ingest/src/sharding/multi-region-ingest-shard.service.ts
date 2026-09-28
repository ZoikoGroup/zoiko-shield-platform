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

export type ResidencyClass = 'EU_EEA' | 'US' | 'APAC';

export interface ShardedIngestRoutingDecision {
  tenantId: string;
  primaryRegion: IngestRegion;
  routingOutcome: 'ROUTED' | 'REFUSED_AUTOMATIC_FAILOVER_NOT_APPROVED';
  routedRegion?: IngestRegion;
  isFailover: boolean;
  failoverReason?: string;
  endpoint?: string;
  partitionHash: string;
}

/**
 * Home-Cell Ingestion Shard Service
 *
 * Per ADR-16 (Regional cell allocation and failover): every tenant has a single home
 * cell, and there is no automatic cross-region failover — residency-breaking or
 * otherwise. Full multi-region active-active is explicitly DEFERRED; the approved
 * availability pattern is Multi-AZ active-active *within* a tenant's activated region,
 * with cross-region recovery only via an approved, tested evacuation/transfer
 * procedure (out of band from request-path routing), never a silent runtime failover.
 * When a tenant's home region is unhealthy this service fails closed (R-11) rather
 * than rerouting traffic anywhere else.
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

  /**
   * Each region's data-residency/regulatory jurisdiction. Descriptive only — reported
   * on refused-routing decisions for operator/evacuation-runbook context. Never used
   * to pick an automatic failover target; see class doc comment.
   */
  private readonly regionResidencyClass: Record<IngestRegion, ResidencyClass> =
    {
      'eu-west-1': 'EU_EEA',
      'us-east-1': 'US',
      'ap-southeast-1': 'APAC',
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
   * Routes an incoming ingestion stream payload to the tenant's home cell shard.
   *
   * Per ADR-16 there is no automatic failover target: if the home region is not
   * HEALTHY, this fails closed (R-11) rather than routing anywhere else. Recovery
   * for an unhealthy home cell is an approved, tested evacuation procedure, not a
   * runtime code path.
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
        routingOutcome: 'ROUTED',
        routedRegion: primaryRegion,
        isFailover: false,
        endpoint: primaryShard.endpoint,
        partitionHash,
      };
    }

    this.logger.error(
      `⛔ [INGEST HOME CELL UNAVAILABLE] Home cell '${primaryRegion}' (residency class '${this.regionResidencyClass[primaryRegion]}') is ${primaryShard.status}. ADR-16 prohibits automatic cross-region failover — refusing to route tenant '${tenantId}'. An approved evacuation/transfer procedure is required.`,
    );

    return {
      tenantId,
      primaryRegion,
      routingOutcome: 'REFUSED_AUTOMATIC_FAILOVER_NOT_APPROVED',
      isFailover: false,
      failoverReason: `Home region ${primaryRegion} is ${primaryShard.status} (Replication lag: ${primaryShard.replicationLagMs}ms). No automatic failover target exists per ADR-16 — requires an approved evacuation/transfer procedure.`,
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
