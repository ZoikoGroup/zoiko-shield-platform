import { DeletionRetryService } from './deletion-retry.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TenantOffboardingService } from '../lifecycle/tenant-offboarding.service';

/**
 * Durable progression (ZS-ENG-OFF-DEL-001 decision 4). The point of these
 * tests is that the worker is patient in the right places: it must not drive
 * a purge forward before its retention period is up, before a backoff has
 * elapsed, or past a task a human has been asked to look at.
 */
describe('DeletionRetryService', () => {
  const HOUR = 3_600_000;

  let prisma: any;
  let offboarding: any;
  let service: DeletionRetryService;

  const run = (over: Record<string, unknown> = {}) => ({
    id: 'run-1',
    tenant_id: 'tenant-1',
    deletion_request_id: 'del-req-1',
    status: 'FAILED',
    ...over,
  });

  beforeEach(() => {
    prisma = {
      tenantOffboardingRun: { findMany: jest.fn().mockResolvedValue([]) },
      deletionRequest: { findUnique: jest.fn() },
      deletionTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    offboarding = { resumeDeletion: jest.fn().mockResolvedValue({}) };
    service = new DeletionRetryService(
      prisma as PrismaService,
      offboarding as TenantOffboardingService,
    );
  });

  const waitingRun = (expiresAt: Date | null) => {
    prisma.tenantOffboardingRun.findMany.mockImplementation(
      ({ where }: any) =>
        where.status === 'RETENTION_WAIT' ? [run({ status: 'RETENTION_WAIT' })] : [],
    );
    prisma.deletionRequest.findUnique.mockResolvedValue({
      id: 'del-req-1',
      retention_expires_at: expiresAt,
    });
  };

  describe('runs waiting on retention', () => {
    it('resumes a run once its retention period has elapsed', async () => {
      waitingRun(new Date(Date.now() - HOUR));

      await service.resumeDue();

      expect(offboarding.resumeDeletion).toHaveBeenCalledWith(
        'tenant-1',
        'run-1',
      );
    });

    it('leaves a run alone while its retention period still has time to run', async () => {
      waitingRun(new Date(Date.now() + 30 * 24 * HOUR));

      await service.resumeDue();

      expect(offboarding.resumeDeletion).not.toHaveBeenCalled();
    });

    it('will not resume a request that carries no retention determination', async () => {
      waitingRun(null);

      await service.resumeDue();

      expect(offboarding.resumeDeletion).not.toHaveBeenCalled();
    });
  });

  describe('runs with incomplete stores', () => {
    const failedRunWith = (tasks: Array<Record<string, unknown>>) => {
      prisma.tenantOffboardingRun.findMany.mockImplementation(({ where }: any) =>
        where.status?.in ? [run()] : [],
      );
      prisma.deletionTask.findMany.mockResolvedValue(tasks);
    };

    it('retries an incomplete store once its backoff has elapsed', async () => {
      failedRunWith([
        { store_type: 'OBJECT_STORAGE', status: 'FAILED', attempt: 1, last_attempt_at: new Date(Date.now() - HOUR) },
      ]);

      await service.resumeDue();

      expect(offboarding.resumeDeletion).toHaveBeenCalledWith(
        'tenant-1',
        'run-1',
      );
    });

    it('waits out the backoff instead of hammering a failing store', async () => {
      failedRunWith([
        { store_type: 'OBJECT_STORAGE', status: 'FAILED', attempt: 2, last_attempt_at: new Date() },
      ]);

      await service.resumeDue();

      expect(offboarding.resumeDeletion).not.toHaveBeenCalled();
    });

    it('stops entirely for a run holding a task in engineering review', async () => {
      failedRunWith([
        { store_type: 'POSTGRES_AUTHORITY', status: 'ENGINEERING_REVIEW', attempt: 3, last_attempt_at: new Date(0) },
        { store_type: 'OBJECT_STORAGE', status: 'FAILED', attempt: 1, last_attempt_at: new Date(0) },
      ]);

      await service.resumeDue();

      // A human has been asked to look at this run. Nothing further may be
      // destroyed until they have.
      expect(offboarding.resumeDeletion).not.toHaveBeenCalled();
    });

    it('does not resume a run whose stores have all finished', async () => {
      failedRunWith([
        { store_type: 'POSTGRES_AUTHORITY', status: 'COMPLETED', attempt: 1, last_attempt_at: new Date(0) },
      ]);

      await service.resumeDue();

      expect(offboarding.resumeDeletion).not.toHaveBeenCalled();
    });

    it('does not resume a task that has already used up its attempts', async () => {
      failedRunWith([
        { store_type: 'OBJECT_STORAGE', status: 'FAILED', attempt: 3, last_attempt_at: new Date(0) },
      ]);

      await service.resumeDue();

      expect(offboarding.resumeDeletion).not.toHaveBeenCalled();
    });

    it('treats a never-attempted task as immediately due', async () => {
      failedRunWith([
        { store_type: 'OBJECT_STORAGE', status: 'PENDING', attempt: 0, last_attempt_at: null },
      ]);

      await service.resumeDue();

      expect(offboarding.resumeDeletion).toHaveBeenCalled();
    });
  });

  it('swallows a resume failure so one stuck tenant cannot stop the worker', async () => {
    waitingRun(new Date(Date.now() - HOUR));
    offboarding.resumeDeletion.mockRejectedValue(
      new Error('blocked by an active legal hold'),
    );

    await expect(service.resumeDue()).resolves.toBeUndefined();
  });

  it('does not run concurrently with itself', async () => {
    let release: () => void = () => {};
    const gate = new Promise<any[]>((resolve) => {
      release = () => resolve([]);
    });
    // Only the first lookup hangs; the rest of the pass runs normally once
    // it is released, so awaiting the first call cannot deadlock the test.
    prisma.tenantOffboardingRun.findMany
      .mockReturnValueOnce(gate)
      .mockResolvedValue([]);

    const first = service.resumeDue();
    await service.resumeDue(); // must return immediately, not queue behind the first
    expect(prisma.tenantOffboardingRun.findMany).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(offboarding.resumeDeletion).not.toHaveBeenCalled();
  });
});
