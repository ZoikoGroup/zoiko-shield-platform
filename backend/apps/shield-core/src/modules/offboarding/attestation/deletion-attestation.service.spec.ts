import { ConflictException } from '@nestjs/common';
import { DeletionAttestationService } from './deletion-attestation.service';

describe('DeletionAttestationService (spec §71 — honest deletion disclosure)', () => {
  let prisma: any;
  let hashService: any;
  let service: DeletionAttestationService;

  const TENANT_ID = 'tenant-attest-01';
  const DELETION_REQUEST_ID = 'del-req-001';
  const ISSUED_BY = 'data-protection-officer-1';

  const COMPLETED_TASK = {
    id: 'task-1',
    deletion_request_id: DELETION_REQUEST_ID,
    store_type: 'POSTGRES_PRIMARY',
    status: 'COMPLETED',
    verification_result: JSON.stringify({ outcome: 'VERIFIED_DELETED' }),
  };

  beforeEach(() => {
    prisma = {
      deletionTask: { findMany: jest.fn() },
      backupExpiryRecord: { findMany: jest.fn() },
      legalHold: { findMany: jest.fn() },
      deletionAttestation: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          ...data,
          id: data.id,
        })),
      },
    };

    hashService = {
      hashCanonicalJson: jest.fn().mockReturnValue({
        contentHash: 'sha256-abc123',
      }),
    };

    service = new DeletionAttestationService(prisma, hashService);
  });

  // ─── Happy Path ───────────────────────────────────────────────────────────

  describe('issue — happy path', () => {
    it('creates an attestation when all tasks are COMPLETED with VERIFIED_DELETED outcome', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([COMPLETED_TASK]);
      prisma.backupExpiryRecord.findMany.mockResolvedValue([]);
      prisma.legalHold.findMany.mockResolvedValue([]);

      const result = await service.issue(
        TENANT_ID,
        DELETION_REQUEST_ID,
        ISSUED_BY,
      );

      expect(prisma.deletionAttestation.create).toHaveBeenCalledTimes(1);
      const created = prisma.deletionAttestation.create.mock.calls[0][0].data;
      expect(created.tenant_id).toBe(TENANT_ID);
      expect(created.deletion_request_id).toBe(DELETION_REQUEST_ID);
      expect(created.issued_by).toBe(ISSUED_BY);
      expect(result).toBeDefined();
    });

    it('includes the attestation_hash in the created record', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([COMPLETED_TASK]);
      prisma.backupExpiryRecord.findMany.mockResolvedValue([]);
      prisma.legalHold.findMany.mockResolvedValue([]);

      await service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY);

      const created = prisma.deletionAttestation.create.mock.calls[0][0].data;
      expect(created.attestation_hash).toBe('sha256-abc123');
    });

    it('records NOT_APPLICABLE stores as limitations, not FAILED', async () => {
      const naTask = {
        ...COMPLETED_TASK,
        id: 'task-na',
        store_type: 'OPENSEARCH_SECONDARY',
        verification_result: JSON.stringify({ outcome: 'NOT_APPLICABLE' }),
      };
      prisma.deletionTask.findMany.mockResolvedValue([COMPLETED_TASK, naTask]);
      prisma.backupExpiryRecord.findMany.mockResolvedValue([]);
      prisma.legalHold.findMany.mockResolvedValue([]);

      await service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY);

      const limitationsJson =
        prisma.deletionAttestation.create.mock.calls[0][0].data.limitations;
      const limitations = JSON.parse(limitationsJson) as string[];
      expect(limitations.some((l) => l.includes('OPENSEARCH_SECONDARY'))).toBe(
        true,
      );
    });

    it('includes active legal holds in retained_scopes (honest disclosure)', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([COMPLETED_TASK]);
      prisma.backupExpiryRecord.findMany.mockResolvedValue([]);
      prisma.legalHold.findMany.mockResolvedValue([
        {
          id: 'hold-1',
          tenant_id: TENANT_ID,
          status: 'ACTIVE',
          reason: 'GDPR_DPA_INVESTIGATION',
          scope: 'FINANCIAL_RECORDS',
        },
      ]);

      await service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY);

      const legalHoldRefs = JSON.parse(
        prisma.deletionAttestation.create.mock.calls[0][0].data.legal_hold_refs,
      ) as string[];
      expect(legalHoldRefs).toContain('hold-1');
    });

    it('flags PENDING backup expiry records in limitations', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([COMPLETED_TASK]);
      prisma.backupExpiryRecord.findMany.mockResolvedValue([
        {
          id: 'bak-1',
          backup_class: 'DATABASE_POINT_IN_TIME_RECOVERY',
          status: 'PENDING',
          retained_until: new Date(Date.now() + 86400000), // 24h from now (Date object)
        },
      ]);
      prisma.legalHold.findMany.mockResolvedValue([]);

      await service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY);

      const limitationsJson =
        prisma.deletionAttestation.create.mock.calls[0][0].data.limitations;
      const limitations = JSON.parse(limitationsJson) as string[];
      expect(limitations.some((l) => l.includes('PENDING'))).toBe(true);
    });
  });

  // ─── Pre-condition Guards ─────────────────────────────────────────────────

  describe('issue — pre-condition guards', () => {
    it('throws ConflictException when no deletion tasks exist', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([]);

      await expect(
        service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when any deletion task is still PENDING', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([
        COMPLETED_TASK,
        {
          ...COMPLETED_TASK,
          id: 'task-2',
          status: 'PENDING',
          verification_result: null,
        },
      ]);

      await expect(
        service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when any deletion task has a non-terminal outcome', async () => {
      const badTask = {
        ...COMPLETED_TASK,
        id: 'task-bad',
        verification_result: JSON.stringify({ outcome: 'IN_PROGRESS' }),
      };
      prisma.deletionTask.findMany.mockResolvedValue([badTask]);

      await expect(
        service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when verification_result JSON is malformed', async () => {
      const malformedTask = {
        ...COMPLETED_TASK,
        id: 'task-mal',
        verification_result: 'NOT_JSON{{{',
      };
      prisma.deletionTask.findMany.mockResolvedValue([malformedTask]);

      await expect(
        service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── Cross-Tenant Guard ───────────────────────────────────────────────────

  describe('issue — cross-tenant isolation', () => {
    it('scopes legal-hold lookup to the calling tenantId, not a cross-tenant ID', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([COMPLETED_TASK]);
      prisma.backupExpiryRecord.findMany.mockResolvedValue([]);
      prisma.legalHold.findMany.mockResolvedValue([]);

      await service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY);

      expect(prisma.legalHold.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
          }),
        }),
      );
    });
  });

  // ─── Hash Integrity ───────────────────────────────────────────────────────

  describe('issue — attestation hash integrity', () => {
    it('calls hashCanonicalJson with a body that includes tenantId and deletionRequestId', async () => {
      prisma.deletionTask.findMany.mockResolvedValue([COMPLETED_TASK]);
      prisma.backupExpiryRecord.findMany.mockResolvedValue([]);
      prisma.legalHold.findMany.mockResolvedValue([]);

      await service.issue(TENANT_ID, DELETION_REQUEST_ID, ISSUED_BY);

      const hashArg = hashService.hashCanonicalJson.mock.calls[0][0];
      expect(hashArg.tenantId).toBe(TENANT_ID);
      expect(hashArg.deletionRequestId).toBe(DELETION_REQUEST_ID);
    });
  });
});
