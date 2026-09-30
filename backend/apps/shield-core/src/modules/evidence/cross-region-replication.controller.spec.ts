import { Test, TestingModule } from '@nestjs/testing';
import { CrossRegionReplicationController } from './cross-region-replication.controller';
import { CrossRegionLedgerReplicatorService } from './cross-region-ledger-replicator.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';

describe('CrossRegionReplicationController', () => {
  let controller: CrossRegionReplicationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CrossRegionReplicationController],
      providers: [CrossRegionLedgerReplicatorService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CrossRegionReplicationController>(
      CrossRegionReplicationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return replication status via controller', () => {
    const res = controller.getReplicationStatus('stream-eu-west1-eu-west4');

    expect(res.statusCode).toBe(200);
    expect(res.data.syncState).toBe('SYNCHRONIZED_ZERO_RPO');
  });

  it('should execute failover drill via controller', () => {
    const res = controller.executeFailoverDrill({
      primaryRegion: 'europe-west1',
      standbyRegion: 'europe-west4',
    });

    expect(res.statusCode).toBe(200);
    expect(res.data.cutoverStatus).toBe('FAILOVER_DRILL_VERIFIED_SUCCESSFUL');
  });
});
