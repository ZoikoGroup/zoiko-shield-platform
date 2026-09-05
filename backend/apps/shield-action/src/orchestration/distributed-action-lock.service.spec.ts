import { Test, TestingModule } from '@nestjs/testing';
import { DistributedActionLockService } from './distributed-action-lock.service';
import { ConflictException } from '@nestjs/common';

describe('DistributedActionLockService', () => {
  let service: DistributedActionLockService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DistributedActionLockService],
    }).compile();

    service = module.get<DistributedActionLockService>(
      DistributedActionLockService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should acquire an exclusive distributed action lock on a target asset', () => {
    const result = service.acquireLock({
      tenantId: 'tenant-bank-01',
      actionType: 'ISOLATE_ENDPOINT',
      targetResource: 'srv-db-primary-01',
      idempotencyKey: 'idem-key-isolate-1',
      ownerId: 'soc-playbook-runner-01',
      ttlSeconds: 30,
    });

    expect(result.acquired).toBe(true);
    expect(result.status).toBe('ACQUIRED');
    expect(result.lockToken).toMatch(/^lock-tok-/);
    expect(result.lockKey).toBe('tenant-bank-01:ISOLATE_ENDPOINT:srv-db-primary-01');

    const lockInfo = service.isResourceLocked(
      'tenant-bank-01',
      'ISOLATE_ENDPOINT',
      'srv-db-primary-01',
    );
    expect(lockInfo.locked).toBe(true);
    expect(lockInfo.ownerId).toBe('soc-playbook-runner-01');
  });

  it('should allow idempotent re-entry with identical idempotencyKey and ownerId', () => {
    const lock1 = service.acquireLock({
      tenantId: 'tenant-bank-01',
      actionType: 'REVOKE_IAM_SESSION',
      targetResource: 'usr-compromised-analyst',
      idempotencyKey: 'idem-key-revoke-99',
      ownerId: 'soc-worker-02',
      ttlSeconds: 60,
    });

    const lock2 = service.acquireLock({
      tenantId: 'tenant-bank-01',
      actionType: 'REVOKE_IAM_SESSION',
      targetResource: 'usr-compromised-analyst',
      idempotencyKey: 'idem-key-revoke-99',
      ownerId: 'soc-worker-02',
    });

    expect(lock2.acquired).toBe(true);
    expect(lock2.status).toBe('ACQUIRED_IDEMPOTENT');
    expect(lock2.lockToken).toBe(lock1.lockToken);
  });

  it('should throw ConflictException if a different worker attempts to lock an actively locked resource', () => {
    service.acquireLock({
      tenantId: 'tenant-bank-01',
      actionType: 'QUARANTINE_CONTAINER',
      targetResource: 'pod-payment-gateway-88',
      idempotencyKey: 'idem-key-quarantine-1',
      ownerId: 'soc-worker-alpha',
      ttlSeconds: 60,
    });

    expect(() =>
      service.acquireLock({
        tenantId: 'tenant-bank-01',
        actionType: 'QUARANTINE_CONTAINER',
        targetResource: 'pod-payment-gateway-88',
        idempotencyKey: 'idem-key-quarantine-2',
        ownerId: 'soc-worker-beta',
      }),
    ).toThrow(ConflictException);
  });

  it('should release lock when valid lockToken is provided', () => {
    const lock = service.acquireLock({
      tenantId: 'tenant-bank-01',
      actionType: 'BLOCK_IP',
      targetResource: '198.51.100.24',
      idempotencyKey: 'idem-key-block-ip',
      ownerId: 'soc-worker-01',
      ttlSeconds: 60,
    });

    const released = service.releaseLock(
      'tenant-bank-01',
      'BLOCK_IP',
      '198.51.100.24',
      lock.lockToken,
    );

    expect(released).toBe(true);

    const lockInfo = service.isResourceLocked(
      'tenant-bank-01',
      'BLOCK_IP',
      '198.51.100.24',
    );
    expect(lockInfo.locked).toBe(false);
  });

  it('should reject release if invalid lockToken is supplied', () => {
    service.acquireLock({
      tenantId: 'tenant-bank-01',
      actionType: 'BLOCK_IP',
      targetResource: '203.0.113.50',
      idempotencyKey: 'idem-key-block-2',
      ownerId: 'soc-worker-01',
      ttlSeconds: 60,
    });

    const released = service.releaseLock(
      'tenant-bank-01',
      'BLOCK_IP',
      '203.0.113.50',
      'invalid-wrong-token',
    );

    expect(released).toBe(false);
  });

  it('should renew heartbeat TTL for active lock', () => {
    const lock = service.acquireLock({
      tenantId: 'tenant-bank-01',
      actionType: 'ISOLATE_ENDPOINT',
      targetResource: 'ws-analyst-laptop',
      idempotencyKey: 'idem-key-laptop-1',
      ownerId: 'soc-worker-01',
      ttlSeconds: 10,
    });

    const renewed = service.renewLockHeartbeat(
      'tenant-bank-01',
      'ISOLATE_ENDPOINT',
      'ws-analyst-laptop',
      lock.lockToken,
      120,
    );

    expect(renewed).toBe(true);
  });
});
