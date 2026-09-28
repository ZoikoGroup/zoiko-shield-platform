import { DisasterRecoveryPartitionService } from './disaster-recovery-partition.service';

describe('DisasterRecoveryPartitionService (Multi-AZ within the activated GCP region — ADR-16)', () => {
  let drService: DisasterRecoveryPartitionService;

  beforeEach(() => {
    drService = new DisasterRecoveryPartitionService();
  });

  it('should initialize with a healthy Multi-AZ GCP cluster topology within one activated region', () => {
    const topology = drService.getClusterTopology();
    expect(topology.length).toBe(3);
    expect(topology.every((n) => n.cloudProvider === 'GCP')).toBe(true);
    expect(new Set(topology.map((n) => n.region)).size).toBe(1);

    const primary = topology.find((n) => n.role === 'ACTIVE_PRIMARY');
    expect(primary?.cloudProvider).toBe('GCP');
    expect(primary?.region).toBe('europe-west3');
    expect(primary?.zone).toBe('europe-west3-a');
  });

  it('should promote a Multi-AZ standby to ACTIVE_PRIMARY upon a zonal partition with zero anchor drift', () => {
    // 1. Simulate a zonal outage on the primary
    drService.simulateCloudPartition('node-gcp-europe-west3-a-primary');

    // 2. Execute automated failover
    const result = drService.executeAutomatedFailover();

    expect(result.failoverId).toBeDefined();
    expect(result.previousLeaderNodeId).toBe('node-gcp-europe-west3-a-primary');
    expect(result.newLeaderNodeId).toBe('node-gcp-europe-west3-b-standby');
    expect(result.newLeaderCloudProvider).toBe('GCP');
    expect(result.newLeaderRegion).toBe('europe-west3');
    expect(result.newLeaderZone).toBe('europe-west3-b');
    expect(result.merkleAnchorDriftDetected).toBe(false);
    expect(result.status).toBe('FAILOVER_SUCCESS_ZERO_DRIFT');
    expect(result.failoverAttestationDigest).toBeDefined();

    // Verify new topology leadership
    const updatedTopology = drService.getClusterTopology();
    const newLeader = updatedTopology.find(
      (n) => n.nodeId === 'node-gcp-europe-west3-b-standby',
    );
    expect(newLeader?.role).toBe('ACTIVE_PRIMARY');
  });
});
