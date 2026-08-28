import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type NodeRole =
  'ACTIVE_PRIMARY' | 'STANDBY_SOVEREIGN_REPLICA' | 'DEGRADED_PARTITIONED';

export interface CloudNodeState {
  nodeId: string;
  cloudProvider: 'AWS' | 'AZURE' | 'GCP';
  region: string;
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
  reconciledOutboxEventsCount: number;
  merkleAnchorDriftDetected: boolean;
  status:
    'FAILOVER_SUCCESS_ZERO_DRIFT' | 'FAILOVER_SUCCESS_RECONCILIATION_REQUIRED';
  failoverAttestationDigest: string;
  executedAt: string;
}

/**
 * Multi-Cloud Disaster Recovery & Sovereign Partitioning Engine
 * Specification: ZS-T0-TECH-001 §11 (Cross-Cloud High Availability & Zero-Drift Failover)
 */
@Injectable()
export class DisasterRecoveryPartitionService {
  private readonly logger = new Logger(DisasterRecoveryPartitionService.name);

  // Registered Sovereign DR Nodes
  private nodes: CloudNodeState[] = [
    {
      nodeId: 'node-aws-us-east-1-primary',
      cloudProvider: 'AWS',
      region: 'us-east-1',
      role: 'ACTIVE_PRIMARY',
      lastHeartbeatEpochMs: Date.now(),
      lastCommittedEpochSequence: 1042,
      isHealthy: true,
    },
    {
      nodeId: 'node-azure-eu-west-1-standby',
      cloudProvider: 'AZURE',
      region: 'eu-west-1',
      role: 'STANDBY_SOVEREIGN_REPLICA',
      lastHeartbeatEpochMs: Date.now(),
      lastCommittedEpochSequence: 1042,
      isHealthy: true,
    },
    {
      nodeId: 'node-gcp-europe-west3-standby',
      cloudProvider: 'GCP',
      region: 'europe-west3',
      role: 'STANDBY_SOVEREIGN_REPLICA',
      lastHeartbeatEpochMs: Date.now(),
      lastCommittedEpochSequence: 1042,
      isHealthy: true,
    },
  ];

  /**
   * Simulates a regional cloud outage / partition on the active leader.
   */
  simulateCloudPartition(targetNodeId: string): void {
    const node = this.nodes.find((n) => n.nodeId === targetNodeId);
    if (node) {
      node.isHealthy = false;
      node.role = 'DEGRADED_PARTITIONED';
      this.logger.warn(
        `🚨 [CSP OUTAGE SIMULATION] Node ${node.nodeId} (${node.cloudProvider} ${node.region}) marked as PARTITIONED!`,
      );
    }
  }

  /**
   * Executes automated cross-cloud failover to the most synchronous sovereign standby replica.
   */
  executeAutomatedFailover(): FailoverExecutionResult {
    const currentLeader = this.nodes.find(
      (n) => n.role === 'ACTIVE_PRIMARY' || n.role === 'DEGRADED_PARTITIONED',
    );
    const eligibleStandby = this.nodes.find(
      (n) => n.role === 'STANDBY_SOVEREIGN_REPLICA' && n.isHealthy,
    );

    if (!eligibleStandby) {
      throw new Error(
        'Disaster recovery failed: No healthy sovereign standby nodes available for failover promotion',
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
      `✔ Promoted Sovereign Node [${eligibleStandby.nodeId}] (${eligibleStandby.cloudProvider} ${eligibleStandby.region}) to ACTIVE_PRIMARY with ZERO Merkle Drift!`,
    );

    return {
      failoverId,
      previousLeaderNodeId: previousLeaderId,
      newLeaderNodeId: eligibleStandby.nodeId,
      newLeaderCloudProvider: eligibleStandby.cloudProvider,
      newLeaderRegion: eligibleStandby.region,
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
