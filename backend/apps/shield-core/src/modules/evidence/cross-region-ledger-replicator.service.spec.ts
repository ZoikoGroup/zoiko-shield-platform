import { Test, TestingModule } from '@nestjs/testing';
import { CrossRegionLedgerReplicatorService } from './cross-region-ledger-replicator.service';

describe('CrossRegionLedgerReplicatorService', () => {
  let service: CrossRegionLedgerReplicatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrossRegionLedgerReplicatorService],
    }).compile();

    service = module.get<CrossRegionLedgerReplicatorService>(
      CrossRegionLedgerReplicatorService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return active replication status with sub-second lag', () => {
    const status = service.getReplicationStatus('stream-eu-west1-eu-west4');

    expect(status.syncState).toBe('SYNCHRONIZED_ZERO_RPO');
    expect(status.replicationLagMs).toBeLessThan(1000);
    expect(status.primaryRegion).toBe('europe-west1');
    expect(status.standbyRegion).toBe('europe-west4');
  });

  it('should execute disaster recovery failover drill and return verifiable receipt', () => {
    const drill = service.executeFailoverDrill('europe-west1', 'europe-west4');

    expect(drill.cutoverStatus).toBe('FAILOVER_DRILL_VERIFIED_SUCCESSFUL');
    expect(drill.measuredRpoSeconds).toBeLessThan(1);
    expect(drill.measuredRtoSeconds).toBeLessThan(30);
    expect(drill.ledgerChainContinuityVerified).toBe(true);
    expect(drill.drillId).toBeDefined();
  });
});
