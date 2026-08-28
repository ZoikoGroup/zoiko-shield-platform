import { DisasterRecoveryPartitionService } from './disaster-recovery-partition.service';

describe('DisasterRecoveryPartitionService', () => {
  let drService: DisasterRecoveryPartitionService;

  beforeEach(() => {
    drService = new DisasterRecoveryPartitionService();
  });

  it('should initialize with healthy multi-cloud cluster topology', () => {
    const topology = drService.getClusterTopology();
    expect(topology.length).toBe(3);

    const primary = topology.find((n) => n.role === 'ACTIVE_PRIMARY');
    expect(primary?.cloudProvider).toBe('AWS');
    expect(primary?.region).toBe('us-east-1');
  });

  it('should promote sovereign standby to ACTIVE_PRIMARY upon primary cloud partition with zero anchor drift', () => {
    // 1. Simulate AWS US East outage
    drService.simulateCloudPartition('node-aws-us-east-1-primary');

    // 2. Execute automated failover
    const result = drService.executeAutomatedFailover();

    expect(result.failoverId).toBeDefined();
    expect(result.previousLeaderNodeId).toBe('node-aws-us-east-1-primary');
    expect(result.newLeaderNodeId).toBe('node-azure-eu-west-1-standby');
    expect(result.merkleAnchorDriftDetected).toBe(false);
    expect(result.status).toBe('FAILOVER_SUCCESS_ZERO_DRIFT');
    expect(result.failoverAttestationDigest).toBeDefined();

    // Verify new topology leadership
    const updatedTopology = drService.getClusterTopology();
    const newLeader = updatedTopology.find((n) => n.nodeId === 'node-azure-eu-west-1-standby');
    expect(newLeader?.role).toBe('ACTIVE_PRIMARY');
  });
});
