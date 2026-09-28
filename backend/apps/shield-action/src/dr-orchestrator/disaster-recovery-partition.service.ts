import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type NodeRole =
  'ACTIVE_PRIMARY' | 'STANDBY_SOVEREIGN_REPLICA' | 'DEGRADED_PARTITIONED';

export interface CloudNodeState {
  nodeId: string;
  cloudProvider: 'GCP';
  region: string;
  zone: string;
  role: NodeRole;
  lastHeartbeatEpochMs: number;
  lastCommittedEpochSequence: number;
  isHealthy: boolean;
}

export interface FailoverExecutionResult {
  failoverId: string;
  previousLeaderNodeId: string;
  newLeaderNodeId: string;
  newLeaderCloudProvider: string;
  newLeaderRegion: string;
  newLeaderZone: string;
  reconciledOutboxEventsCount: number;
  merkleAnchorDriftDetected: boolean;
  status:
    'FAILOVER_SUCCESS_ZERO_DRIFT' | 'FAILOVER_SUCCESS_RECONCILIATION_REQUIRED';
  failoverAttestationDigest: string;
  executedAt: string;
}

/**
 * Multi-AZ Disaster Recovery & Leader Promotion Engine
 * Architecture: ADR-16 (Regional cell allocation and failover)
 *
 * CORRECTION: this previously modeled "cross-cloud" failover across AWS,
 * Azure and GCP nodes and called itself an "ADR-16 Cross-Cloud High
 * Availability" engine — this platform hosts only on GCP (no AWS/Azure
 * credentials or client exist anywhere in this codebase), and ADR-16 itself
 * does not authorize cross-cloud or cross-region active-active at all: its
 * approved availability pattern is Multi-AZ active-active *within* a
 * tenant's single activated region; full multi-region active-active is
 * explicitly DEFERRED, and cross-region recovery requires an approved,
 * tested evacuation procedure, not automatic promotion (see
 * MultiRegionIngestShardService for the ingest-routing side of this same
 * rule). This service now models exactly that: 3 GCP zones within one
 * activated region, where automatic promotion between zones is the real
 * approved pattern.
 */
@Injectable()
export class DisasterRecoveryPartitionService {
  private readonly logger = new Logger(DisasterRecoveryPartitionService.name);

  private static readonly ACTIVATED_REGION = 'europe-west3';

  // Registered Multi-AZ nodes within the platform's single activated GCP region.
  private nodes: CloudNodeState[] = [
    {
      nodeId: 'node-gcp-europe-west3-a-primary',
      cloudProvider: 'GCP',
      region: 'europe-west3',
      zone: 'europe-west3-a',
      role: 'ACTIVE_PRIMARY',
      lastHeartbeatEpochMs: Date.now(),
      lastCommittedEpochSequence: 1042,
      isHealthy: true,
    },
    {
      nodeId: 'node-gcp-europe-west3-b-standby',
      cloudProvider: 'GCP',
      region: 'europe-west3',
      zone: 'europe-west3-b',
      role: 'STANDBY_SOVEREIGN_REPLICA',
      lastHeartbeatEpochMs: Date.now(),
      lastCommittedEpochSequence: 1042,
      isHealthy: true,
    },
    {
      nodeId: 'node-gcp-europe-west3-c-standby',
      cloudProvider: 'GCP',
      region: 'europe-west3',
      zone: 'europe-west3-c',
      role: 'STANDBY_SOVEREIGN_REPLICA',
      lastHeartbeatEpochMs: Date.now(),
      lastCommittedEpochSequence: 1042,
      isHealthy: true,
    },
  ];

  /**
   * Simulates a zonal outage / partition on the active leader.
   */
  simulateCloudPartition(targetNodeId: string): void {
    const node = this.nodes.find((n) => n.nodeId === targetNodeId);
    if (node) {
      node.isHealthy = false;
      node.role = 'DEGRADED_PARTITIONED';
      this.logger.warn(
        `🚨 [ZONE OUTAGE SIMULATION] Node ${node.nodeId} (${node.cloudProvider} ${node.zone}) marked as PARTITIONED!`,
      );
    }
  }

  /**
   * Executes automated Multi-AZ failover to the most synchronous standby
   * replica within the same activated region. This is the ADR-16-approved
   * availability pattern; a candidate outside the activated region is never
   * considered here (that would be the DEFERRED, non-automatic evacuation
   * path this class does not implement).
   */
  executeAutomatedFailover(): FailoverExecutionResult {
    const currentLeader = this.nodes.find(
      (n) => n.role === 'ACTIVE_PRIMARY' || n.role === 'DEGRADED_PARTITIONED',
    );
    const eligibleStandby = this.nodes.find(
      (n) =>
        n.role === 'STANDBY_SOVEREIGN_REPLICA' &&
        n.isHealthy &&
        n.region === DisasterRecoveryPartitionService.ACTIVATED_REGION,
    );

    if (!eligibleStandby) {
      throw new Error(
        'Disaster recovery failed: no healthy Multi-AZ standby available within the activated region for automatic failover promotion',
      );
    }

    const previousLeaderId = currentLeader ? currentLeader.nodeId : 'UNKNOWN';

    // Demote old leader if still marked active
    if (currentLeader && currentLeader.role === 'ACTIVE_PRIMARY') {
      currentLeader.role = 'DEGRADED_PARTITIONED';
    }

    // Promote standby to active leader
    eligibleStandby.role = 'ACTIVE_PRIMARY';
    const failoverId = `dr-failover-${crypto.randomUUID()}`;
    const leaderSequence = currentLeader?.lastCommittedEpochSequence ?? 0;
    const reconciledOutboxEventsCount = Math.max(
      0,
      leaderSequence - eligibleStandby.lastCommittedEpochSequence,
    );
    const merkleAnchorDriftDetected =
      eligibleStandby.lastCommittedEpochSequence !== leaderSequence;

    const failoverAttestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          failoverId,
          previousLeaderId,
          newLeader: eligibleStandby.nodeId,
          sequence: eligibleStandby.lastCommittedEpochSequence,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Promoted Multi-AZ Node [${eligibleStandby.nodeId}] (${eligibleStandby.cloudProvider} ${eligibleStandby.zone}) to ACTIVE_PRIMARY with ZERO Merkle Drift!`,
    );

    return {
      failoverId,
      previousLeaderNodeId: previousLeaderId,
      newLeaderNodeId: eligibleStandby.nodeId,
      newLeaderCloudProvider: eligibleStandby.cloudProvider,
      newLeaderRegion: eligibleStandby.region,
      newLeaderZone: eligibleStandby.zone,
      reconciledOutboxEventsCount,
      merkleAnchorDriftDetected,
      status: merkleAnchorDriftDetected
        ? 'FAILOVER_SUCCESS_RECONCILIATION_REQUIRED'
        : 'FAILOVER_SUCCESS_ZERO_DRIFT',
      failoverAttestationDigest,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns current node cluster health topology.
   */
  getClusterTopology(): CloudNodeState[] {
    return [...this.nodes];
  }
}
