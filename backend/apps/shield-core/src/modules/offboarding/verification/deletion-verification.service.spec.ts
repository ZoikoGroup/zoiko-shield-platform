import { DeletionVerificationService } from './deletion-verification.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ObjectStorageService } from '../../evidence/storage/object-storage.service';

/**
 * The completion barrier (ZS-ENG-OFF-DEL-001 decision 2). These tests exist
 * because the failure mode this guards against is the dangerous one: a purge
 * that reports success while tenant data is still there. A verifier that
 * cannot fail is worse than no verifier, so most of what follows is about
 * making it fail when it should.
 */
describe('DeletionVerificationService', () => {
  const TENANT_ID = 'tenant-1';
  const REQUEST_ID = 'del-req-1';

  let prisma: any;
  let objectStorage: any;
  let service: DeletionVerificationService;

  /** A fully purged tenant: nothing anywhere, every task done. */
  const cleanState = () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ count: BigInt(0) }]);
    prisma.subjectEncryptionKey.count.mockResolvedValue(0);
    prisma.connectorInstance.count.mockResolvedValue(0);
    prisma.backupExpiryRecord.findMany.mockResolvedValue([
      { status: 'PENDING' },
    ]);
    prisma.deletionTask.findMany.mockResolvedValue([
      { store_type: 'SEARCH', status: 'COMPLETED' },
      { store_type: 'CACHE', status: 'COMPLETED' },
    ]);
    objectStorage.classifyTenantObjectVersions.mockResolvedValue({
      lockRetained: 0,
      unexplained: 0,
      maxRetainUntil: null,
    });
  };

  const surfaceNamed = (name: string) =>
    JSON.parse(
      prisma.deletionVerification.create.mock.calls[0][0].data.surfaces,
    ).find((s: { surface: string }) => s.surface === name);

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      subjectEncryptionKey: { count: jest.fn() },
      connectorInstance: { count: jest.fn() },
      backupExpiryRecord: { findMany: jest.fn() },
      deletionTask: { findMany: jest.fn() },
      deletionVerification: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ ...data, id: 'ver-1' })),
        findFirst: jest.fn(),
      },
    };
    objectStorage = { classifyTenantObjectVersions: jest.fn() };
    service = new DeletionVerificationService(
      prisma as PrismaService,
      objectStorage as ObjectStorageService,
    );
    cleanState();
  });

  it('passes and persists the result when nothing unauthorized survives', async () => {
    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('PASS');
    expect(outcome.residualCount).toBe(0);
    expect(prisma.deletionVerification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          deletion_request_id: REQUEST_ID,
          result: 'PASS',
          residual_count: 0,
          verified_by: 'verifier-1',
        }),
      }),
    );
  });

  it('fails when tenant rows survive in a table the deletion plan did not cover', async () => {
    prisma.$queryRaw.mockResolvedValue([{ table_name: 'Case' }]);
    prisma.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes('FROM "Case"')
        ? [{ count: BigInt(4) }]
        : [{ count: BigInt(0) }],
    );

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('FAIL');
    expect(outcome.residualCount).toBe(4);
    expect(surfaceNamed('AUTHORITATIVE_RELATIONAL_DATA').pass).toBe(false);
  });

  it('counts deletion-control records as retained, not as residual', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { table_name: 'DeletionRequest' },
      { table_name: 'TenantRetentionPolicy' },
    ]);
    prisma.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.startsWith('SELECT COUNT(*)::bigint')
        ? [{ count: BigInt(1) }]
        : [{ count: BigInt(0) }],
    );

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('PASS');
    expect(outcome.residualCount).toBe(0);
    expect(outcome.retainedCount).toBeGreaterThan(0);
  });

  it('fails when a membership, role or tenant record still exists', async () => {
    prisma.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes('tenant_memberships')
        ? [{ count: BigInt(2) }]
        : [{ count: BigInt(0) }],
    );

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('FAIL');
    expect(surfaceNamed('MEMBERSHIP_AND_ACCESS_RELATIONSHIPS').pass).toBe(
      false,
    );
  });

  it('treats WORM-locked object versions as retained once the tenant keys are shredded', async () => {
    objectStorage.classifyTenantObjectVersions.mockResolvedValue({
      lockRetained: 12,
      unexplained: 0,
      maxRetainUntil: '2026-12-17T00:00:00.000Z',
    });
    prisma.subjectEncryptionKey.count.mockResolvedValue(0);

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('PASS');
    const objects = surfaceNamed('OBJECT_STORAGE');
    expect(objects.residual).toBe(0);
    expect(objects.retained).toBe(12);
    expect(objects.detail).toContain('2026-12-17');
  });

  it('treats the same locked versions as residual while key material is still active', async () => {
    objectStorage.classifyTenantObjectVersions.mockResolvedValue({
      lockRetained: 12,
      unexplained: 0,
      maxRetainUntil: '2026-12-17T00:00:00.000Z',
    });
    // Ciphertext nobody can read is a disclosed retention window. Ciphertext
    // with a live key is just surviving tenant data.
    prisma.subjectEncryptionKey.count.mockResolvedValue(3);

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('FAIL');
    const objects = surfaceNamed('OBJECT_STORAGE');
    expect(objects.residual).toBe(12);
    expect(objects.retained).toBe(0);
    expect(objects.detail).toContain('still active');
  });

  it('fails when object versions survive that no retention lock explains', async () => {
    objectStorage.classifyTenantObjectVersions.mockResolvedValue({
      lockRetained: 0,
      unexplained: 5,
      maxRetainUntil: null,
    });

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('FAIL');
    expect(surfaceNamed('OBJECT_STORAGE').residual).toBe(5);
  });

  it('fails when a connector is still active for the tenant', async () => {
    prisma.connectorInstance.count.mockResolvedValue(1);

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('FAIL');
    expect(surfaceNamed('CONNECTOR_STATE').pass).toBe(false);
  });

  it('fails when a derived-store task never finished', async () => {
    prisma.deletionTask.findMany.mockResolvedValue([
      { store_type: 'SEARCH', status: 'COMPLETED' },
      { store_type: 'EMBEDDINGS', status: 'FAILED' },
    ]);

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('FAIL');
    expect(surfaceNamed('SEARCH_VECTOR_AND_DERIVED_STORES').residual).toBe(1);
  });

  it('records pending backup expiry as a disclosed window rather than a failure', async () => {
    prisma.backupExpiryRecord.findMany.mockResolvedValue([
      { status: 'PENDING' },
      { status: 'PENDING' },
      { status: 'EXPIRED_VERIFIED' },
    ]);

    const outcome = await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(outcome.result).toBe('PASS');
    const backups = surfaceNamed('BACKUPS');
    expect(backups.pass).toBe(true);
    expect(backups.retained).toBe(2);
  });

  it('persists a FAIL so the attestation gate can read it back', async () => {
    prisma.connectorInstance.count.mockResolvedValue(2);

    await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    expect(prisma.deletionVerification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: 'FAIL', residual_count: 2 }),
      }),
    );
  });

  it('scopes every surface to the tenant being verified', async () => {
    await service.verify(TENANT_ID, REQUEST_ID, 'verifier-1');

    for (const call of prisma.$queryRawUnsafe.mock.calls) {
      expect(call.slice(1)).toContain(TENANT_ID);
    }
    expect(prisma.subjectEncryptionKey.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT_ID }),
      }),
    );
    expect(objectStorage.classifyTenantObjectVersions).toHaveBeenCalledWith(
      TENANT_ID,
    );
  });

  it('returns the most recent verification for a request', async () => {
    prisma.deletionVerification.findFirst.mockResolvedValue({
      id: 'ver-9',
      result: 'PASS',
    });

    await expect(service.latest(REQUEST_ID)).resolves.toEqual({
      id: 'ver-9',
      result: 'PASS',
    });
    expect(prisma.deletionVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletion_request_id: REQUEST_ID },
        orderBy: { verified_at: 'desc' },
      }),
    );
  });
});
