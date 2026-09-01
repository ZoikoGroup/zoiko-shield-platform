import { Test, TestingModule } from '@nestjs/testing';
import { DistributedLeaseCoordinatorService } from './distributed-lease-coordinator.service';

describe('DistributedLeaseCoordinatorService', () => {
  let service: DistributedLeaseCoordinatorService;
  const resourceKey = 'epoch-sealer:tenant-global-bank';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DistributedLeaseCoordinatorService],
    }).compile();

    service = module.get<DistributedLeaseCoordinatorService>(
      DistributedLeaseCoordinatorService,
    );
  });

  it('should grant a lease with a monotonic fencing token', () => {
    const res = service.acquireLease(
      resourceKey,
      'pod-anchor-eu-1',
      'eu-west-1',
      3000,
    );
    expect(res.acquired).toBe(true);
    expect(res.holderNodeId).toBe('pod-anchor-eu-1');
    expect(res.fencingToken).toBeGreaterThanOrEqual(1001);

    const isValid = service.validateFencingToken(resourceKey, res.fencingToken);
    expect(isValid).toBe(true);
  });

  it('should reject acquisition attempts from another node while active lease is unexpired', () => {
    service.acquireLease(resourceKey, 'pod-anchor-eu-1', 'eu-west-1', 5000);

    const rivalRes = service.acquireLease(
      resourceKey,
      'pod-anchor-us-1',
      'us-east-1',
      5000,
    );
    expect(rivalRes.acquired).toBe(false);
    expect(rivalRes.reason).toContain('Lease currently held');
  });

  it('should grant a higher fencing token to a new leader after lease expiration or release', () => {
    const lease1 = service.acquireLease(
      resourceKey,
      'pod-anchor-eu-1',
      'eu-west-1',
      1000,
    );
    service.releaseLease(resourceKey, 'pod-anchor-eu-1', lease1.fencingToken);

    const lease2 = service.acquireLease(
      resourceKey,
      'pod-anchor-us-1',
      'us-east-1',
      1000,
    );
    expect(lease2.acquired).toBe(true);
    expect(lease2.fencingToken).toBeGreaterThan(lease1.fencingToken);

    // Old token should no longer be valid
    expect(service.validateFencingToken(resourceKey, lease1.fencingToken)).toBe(
      false,
    );
    expect(service.validateFencingToken(resourceKey, lease2.fencingToken)).toBe(
      true,
    );
  });
});
