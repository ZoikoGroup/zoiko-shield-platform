import { MpcThresholdKeyRecoveryService } from './mpc-threshold-key-recovery.service';

describe('MpcThresholdKeyRecoveryService', () => {
  let service: MpcThresholdKeyRecoveryService;

  beforeEach(() => {
    service = new MpcThresholdKeyRecoveryService();
  });

  it('should split key into 5 shares with threshold 3', async () => {
    const split = await service.splitKey(
      'tenant-mpc-1',
      'escrow-master-key',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      3,
      5,
    );

    expect(split.threshold).toBe(3);
    expect(split.totalShares).toBe(5);
    expect(split.shares.length).toBe(5);
    expect(split.masterCommitment).toBeDefined();
  });

  it('should successfully recover key when threshold quorum is submitted', async () => {
    const split = await service.splitKey(
      'tenant-mpc-2',
      'escrow-master-key',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      3,
      5,
    );

    const recovery = await service.recoverKey('tenant-mpc-2', split.splitId, [
      split.shares[0],
      split.shares[2],
      split.shares[4],
    ]);

    expect(recovery.status).toBe('RECOVERED_SUCCESSFULLY');
    expect(recovery.participatingCustodians.length).toBe(3);
    expect(recovery.recoveredKeyDigest).toBe(split.masterCommitment);
  });

  it('should reject recovery when below threshold shares submitted', async () => {
    const split = await service.splitKey(
      'tenant-mpc-3',
      'escrow-master-key',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      3,
      5,
    );

    await expect(
      service.recoverKey('tenant-mpc-3', split.splitId, [
        split.shares[0],
        split.shares[1],
      ]),
    ).rejects.toThrow('Quorum not reached');
  });
});
