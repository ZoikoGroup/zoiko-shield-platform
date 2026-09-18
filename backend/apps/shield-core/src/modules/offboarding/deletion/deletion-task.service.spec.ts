import { ConflictException } from '@nestjs/common';
import {
  DeletionTaskService,
  MAX_DELETION_ATTEMPTS,
} from './deletion-task.service';

/**
 * Tenant purge is a release-gated safety function (ZS-ENG-OFF-DEL-001 §7).
 * It carries the highest blast radius in the platform and, until this file
 * existed, had no tests at all — which is how an unquoted reserved schema name
 * silently aborted every erasure from 2026-08-13 onwards.
 *
 * These cover the ratified behavior: destruction is monotonic and resumable,
 * retries are bounded, nothing partial is ever reported as finished, no
 * principal survives the purge, and a store that physically cannot be erased
 * says so instead of claiming success.
 */
describe('DeletionTaskService (ZS-ENG-OFF-DEL-001 release gate)', () => {
  const TENANT_ID = '11111111-1111-4111-8111-111111111111';
  const REQUEST_ID = 'del-req-1';

  let prisma: any;
  let objectStorage: any;
  let shredding: any;
  let deletionRequests: any;
  let service: DeletionTaskService;
  let executedSql: Array<{ sql: string; params: unknown[] }>;

  const task = (over: Record<string, unknown> = {}) => ({
    id: 'task-1',
    tenant_id: TENANT_ID,
    deletion_request_id: REQUEST_ID,
    store_type: 'POSTGRES_AUTHORITY',
    status: 'PENDING',
    attempt: 0,
    started_at: null,
    last_attempt_at: null,
    ...over,
  });

  /** No tenant-keyed rows and no residuals: a clean, complete purge. */
  const cleanDatabase = () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ table_name: 'Case' }]) // tenant-keyed tables
      .mockResolvedValueOnce([]); // foreign keys
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(0) }]);
  };

  beforeEach(() => {
    executedSql = [];
    prisma = {
      deletionTask: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      subjectEncryptionKey: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        count: jest.fn().mockResolvedValue(0),
      },
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn().mockImplementation(async (fn: any) =>
        fn({
          $executeRawUnsafe: jest
            .fn()
            .mockImplementation((sql: string, ...params: unknown[]) => {
              executedSql.push({ sql, params });
              return Promise.resolve(1);
            }),
        }),
      ),
    };
    objectStorage = { purgeTenantObjects: jest.fn() };
    shredding = { shredAllTenantKeys: jest.fn() };
    deletionRequests = { assertExecutable: jest.fn().mockResolvedValue({}) };

    service = new DeletionTaskService(
      prisma,
      objectStorage,
      shredding,
      deletionRequests,
    );
  });

  const lastUpdate = () => {
    const calls = prisma.deletionTask.update.mock.calls;
    return calls[calls.length - 1][0].data;
  };

  describe('checkpointing and idempotency', () => {
    it('never repeats a COMPLETED store — a finished task is a checkpoint', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ status: 'COMPLETED' }),
      );

      await service.executeTask('task-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.deletionTask.update).not.toHaveBeenCalled();
      // Critically, it also does not re-authorize: nothing destructive ran.
      expect(deletionRequests.assertExecutable).not.toHaveBeenCalled();
    });

    it('refuses to run a task held for engineering review', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ status: 'ENGINEERING_REVIEW', attempt: MAX_DELETION_ATTEMPTS }),
      );

      await expect(service.executeTask('task-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('resumes a FAILED task and counts the attempt', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ status: 'FAILED', attempt: 1 }),
      );
      cleanDatabase();

      await service.executeTask('task-1');

      const running = prisma.deletionTask.update.mock.calls[0][0].data;
      expect(running.status).toBe('RUNNING');
      expect(running.attempt).toBe(2);
      expect(lastUpdate().status).toBe('COMPLETED');
    });
  });

  describe('bounded retries', () => {
    it('marks a task FAILED — never COMPLETED — when a store errors', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(task());
      prisma.$queryRaw.mockRejectedValue(new Error('connection reset'));

      await expect(service.executeTask('task-1')).rejects.toThrow(
        'connection reset',
      );

      const data = lastUpdate();
      expect(data.status).toBe('FAILED');
      expect(data.error_code).toContain('connection reset');
      // A failed attempt must not look finished.
      expect(data.completed_at).toBeUndefined();
    });

    it('stops for a human once retries are exhausted instead of looping', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ status: 'FAILED', attempt: MAX_DELETION_ATTEMPTS - 1 }),
      );
      prisma.$queryRaw.mockRejectedValue(new Error('still broken'));

      await expect(service.executeTask('task-1')).rejects.toThrow(
        'still broken',
      );

      expect(lastUpdate().status).toBe('ENGINEERING_REVIEW');
    });
  });

  describe('authorization is re-evaluated at every store boundary', () => {
    it('re-checks retention and legal holds before destroying anything', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(task());
      deletionRequests.assertExecutable.mockRejectedValue(
        new ConflictException('blocked by an active legal hold'),
      );

      await expect(service.executeTask('task-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.deletionTask.update).not.toHaveBeenCalled();
    });
  });

  describe('authoritative relational deletion', () => {
    it('quotes the reserved "authorization" schema in every statement', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(task());
      cleanDatabase();

      await service.executeTask('task-1');

      const authorizationStatements = executedSql.filter(({ sql }) =>
        /authorization"?\./i.test(sql),
      );
      expect(authorizationStatements.length).toBeGreaterThan(0);
      for (const { sql } of authorizationStatements) {
        // Unquoted, `authorization` is a reserved word and a syntax error,
        // which aborts the surrounding transaction and erases nothing.
        expect(sql).not.toMatch(
          /(FROM|JOIN|INTO|UPDATE|DELETE FROM)\s+(?!")authorization\./i,
        );
      }
    });

    it('leaves no principal behind — the closing operator is not exempt', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(task());
      cleanDatabase();

      await service.executeTask('task-1');

      const membershipDelete = executedSql.find(({ sql }) =>
        /DELETE FROM "authorization"\.tenant_memberships/i.test(sql),
      );
      expect(membershipDelete).toBeDefined();
      expect(membershipDelete!.sql).not.toMatch(/principalId"?\s*<>/i);
      expect(membershipDelete!.params).toEqual([TENANT_ID]);
    });

    it('binds the tenant id as a parameter rather than interpolating it', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(task());
      cleanDatabase();

      await service.executeTask('task-1');

      for (const { sql, params } of executedSql) {
        expect(sql).not.toContain(TENANT_ID);
        expect(params).toContain(TENANT_ID);
      }
    });

    it('fails when rows survive the delete rather than reporting success', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(task());
      prisma.$queryRaw
        .mockResolvedValueOnce([{ table_name: 'Case' }])
        .mockResolvedValueOnce([]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(3) }]);

      await expect(service.executeTask('task-1')).rejects.toThrow(
        /row\(s\) remain after deletion/,
      );
      expect(lastUpdate().status).toBe('FAILED');
    });

    it('retains the deletion-control tables that prove the operation', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(task());
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { table_name: 'Case' },
          { table_name: 'DeletionRequest' },
          { table_name: 'LegalHold' },
          { table_name: 'TenantRetentionPolicy' },
        ])
        .mockResolvedValueOnce([]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(0) }]);

      await service.executeTask('task-1');

      const deletedTables = executedSql
        .map(({ sql }) => /DELETE FROM "([A-Za-z_][A-Za-z0-9_]*)"/.exec(sql))
        .flatMap((match) => (match ? [match[1]] : []));
      expect(deletedTables).toContain('Case');
      expect(deletedTables).not.toContain('DeletionRequest');
      expect(deletedTables).not.toContain('LegalHold');
      expect(deletedTables).not.toContain('TenantRetentionPolicy');
    });
  });

  describe('object storage under Object Lock', () => {
    it('reports a verified deletion only when nothing physically survives', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ store_type: 'OBJECT_STORAGE' }),
      );
      objectStorage.purgeTenantObjects.mockResolvedValue({
        permanentlyDeleted: 4,
        wormRetained: 0,
        deleteMarkersPlaced: 0,
        physicalExpiryAt: null,
      });

      await service.executeTask('task-1');

      const result = JSON.parse(lastUpdate().verification_result);
      expect(result.outcome).toBe('VERIFIED_DELETED');
      expect(result.remainingObjects).toBe(0);
    });

    it('discloses the WORM expiry window instead of claiming a deletion', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ store_type: 'OBJECT_STORAGE' }),
      );
      objectStorage.purgeTenantObjects.mockResolvedValue({
        permanentlyDeleted: 1,
        wormRetained: 2,
        deleteMarkersPlaced: 2,
        physicalExpiryAt: '2027-01-01T00:00:00.000Z',
      });

      await service.executeTask('task-1');

      const result = JSON.parse(lastUpdate().verification_result);
      expect(result.outcome).toBe('LOGICALLY_DELETED_PENDING_PHYSICAL_EXPIRY');
      expect(result.wormProtectedVersions).toBe(2);
      expect(result.physicalExpiryAt).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('cryptographic shredding', () => {
    it('fails if any usable tenant key survives', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ store_type: 'CRYPTO_SHRED' }),
      );
      shredding.shredAllTenantKeys.mockResolvedValue({
        certificates: [{ proofOfObliterationDigest: 'digest-1' }],
        remainingActiveKeys: 1,
      });

      await expect(service.executeTask('task-1')).rejects.toThrow(
        /active subject encryption key/,
      );
      expect(lastUpdate().status).toBe('FAILED');
    });

    it('records the obliteration proofs when every key is destroyed', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ store_type: 'CRYPTO_SHRED' }),
      );
      shredding.shredAllTenantKeys.mockResolvedValue({
        certificates: [
          { proofOfObliterationDigest: 'digest-1' },
          { proofOfObliterationDigest: 'digest-2' },
        ],
        remainingActiveKeys: 0,
      });

      await service.executeTask('task-1');

      const result = JSON.parse(lastUpdate().verification_result);
      expect(result.outcome).toBe('VERIFIED_DELETED');
      expect(result.shreddedSubjectKeys).toBe(2);
      expect(result.proofOfObliterationDigests).toEqual([
        'digest-1',
        'digest-2',
      ]);
    });
  });

  describe('stores with no backing system', () => {
    it('says so honestly rather than fabricating a deletion', async () => {
      prisma.deletionTask.findUniqueOrThrow.mockResolvedValue(
        task({ store_type: 'EMBEDDINGS' }),
      );

      await service.executeTask('task-1');

      const result = JSON.parse(lastUpdate().verification_result);
      expect(result.outcome).toBe('NOT_APPLICABLE');
      expect(result.outcome).not.toBe('VERIFIED_DELETED');
    });
  });
});
