import { BackupExpiryService } from './backup-expiry.service';

describe('BackupExpiryService (spec §18/§19/§70 — honest backup retention disclosure)', () => {
  let prisma: any;
  let service: BackupExpiryService;

  const TENANT_ID = 'tenant-bak-01';
  const DELETION_REQUEST_ID = 'del-req-bak-001';

  beforeEach(() => {
    prisma = {
      backupExpiryRecord: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          ...data,
          id: data.id ?? 'record-1',
        })),
        findMany: jest.fn(),
        update: jest.fn().mockImplementation(({ data, where }: any) => ({
          id: where.id,
          ...data,
        })),
      },
    };

    service = new BackupExpiryService(prisma);
  });

  // ─── recordPending ─────────────────────────────────────────────────────────

  describe('recordPending', () => {
    it('creates a PENDING backup expiry record with a future retainedUntil date', async () => {
      await service.recordPending(TENANT_ID, DELETION_REQUEST_ID);

      expect(prisma.backupExpiryRecord.create).toHaveBeenCalledTimes(1);
      const createdData =
        prisma.backupExpiryRecord.create.mock.calls[0][0].data;
      expect(createdData.tenant_id).toBe(TENANT_ID);
      expect(createdData.deletion_request_id).toBe(DELETION_REQUEST_ID);
      expect(createdData.status).toBe('PENDING');
      expect(createdData.backup_class).toBe('DATABASE_POINT_IN_TIME_RECOVERY');
    });

    it('sets retainedUntil to approximately 35 days in the future', async () => {
      const before = Date.now();
      await service.recordPending(TENANT_ID, DELETION_REQUEST_ID);
      const after = Date.now();

      const created = prisma.backupExpiryRecord.create.mock.calls[0][0].data;
      const retainedUntilMs = new Date(created.retained_until).getTime();
      const thirtyFiveDaysMs = 35 * 24 * 60 * 60 * 1000;

      // Allow ±5 seconds for test execution time
      expect(retainedUntilMs).toBeGreaterThanOrEqual(
        before + thirtyFiveDaysMs - 5000,
      );
      expect(retainedUntilMs).toBeLessThanOrEqual(
        after + thirtyFiveDaysMs + 5000,
      );
    });

    it('assigns a unique ID to every created record', async () => {
      await service.recordPending(TENANT_ID, DELETION_REQUEST_ID);
      await service.recordPending(TENANT_ID, 'del-req-002');

      const ids = prisma.backupExpiryRecord.create.mock.calls.map(
        ([call]: [any]) => call.data.id,
      );
      expect(new Set(ids).size).toBe(2);
    });
  });

  // ─── checkAndVerifyExpired — all expired ──────────────────────────────────

  describe('checkAndVerifyExpired — all records expired', () => {
    it('returns allExpired=true and marks PENDING record as EXPIRED_VERIFIED when past due', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second in the past
      prisma.backupExpiryRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          deletion_request_id: DELETION_REQUEST_ID,
          status: 'PENDING',
          final_expiry_expected_at: pastDate,
        },
      ]);

      const result = await service.checkAndVerifyExpired(DELETION_REQUEST_ID);

      expect(result.allExpired).toBe(true);
      expect(prisma.backupExpiryRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-1' },
          data: expect.objectContaining({ status: 'EXPIRED_VERIFIED' }),
        }),
      );
    });

    it('returns allExpired=true when all records are already EXPIRED_VERIFIED', async () => {
      prisma.backupExpiryRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          status: 'EXPIRED_VERIFIED',
          final_expiry_expected_at: new Date(Date.now() - 86400000),
        },
      ]);

      const result = await service.checkAndVerifyExpired(DELETION_REQUEST_ID);

      expect(result.allExpired).toBe(true);
      expect(prisma.backupExpiryRecord.update).not.toHaveBeenCalled();
    });

    it('returns allExpired=true when there are no records at all', async () => {
      prisma.backupExpiryRecord.findMany.mockResolvedValue([]);

      const result = await service.checkAndVerifyExpired(DELETION_REQUEST_ID);

      expect(result.allExpired).toBe(true);
    });
  });

  // ─── checkAndVerifyExpired — records still pending ─────────────────────────

  describe('checkAndVerifyExpired — records still pending', () => {
    it('returns allExpired=false when a PENDING record has not yet passed final_expiry_expected_at', async () => {
      const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days from now
      prisma.backupExpiryRecord.findMany.mockResolvedValue([
        {
          id: 'rec-future',
          status: 'PENDING',
          final_expiry_expected_at: futureDate,
        },
      ]);

      const result = await service.checkAndVerifyExpired(DELETION_REQUEST_ID);

      expect(result.allExpired).toBe(false);
      expect(prisma.backupExpiryRecord.update).not.toHaveBeenCalled();
    });

    it('returns allExpired=false in a mixed state (one expired, one still pending)', async () => {
      const pastDate = new Date(Date.now() - 1000);
      const futureDate = new Date(Date.now() + 86400000 * 10);

      prisma.backupExpiryRecord.findMany.mockResolvedValue([
        {
          id: 'rec-past',
          status: 'PENDING',
          final_expiry_expected_at: pastDate,
        },
        {
          id: 'rec-future',
          status: 'PENDING',
          final_expiry_expected_at: futureDate,
        },
      ]);

      const result = await service.checkAndVerifyExpired(DELETION_REQUEST_ID);

      expect(result.allExpired).toBe(false);
      // Only the past-due record should be updated
      expect(prisma.backupExpiryRecord.update).toHaveBeenCalledTimes(1);
      expect(prisma.backupExpiryRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rec-past' } }),
      );
    });
  });
});
