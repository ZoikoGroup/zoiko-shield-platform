import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from '../outbox/outbox.service';

describe('EvidenceService in shield-ingest (Decoupled)', () => {
  let service: EvidenceService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      evidenceRecord: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      case: {
        findFirst: jest.fn(),
      },
      caseEvidence: {
        create: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
      // Evidence creation now writes the record, its optional case link, and
      // the outbox event as one atomic transaction; each array entry is
      // already an invoked (mocked) call by the time it reaches here.
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        OutboxService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  it('creates evidence record, links it to the case, and emits the outbox event', async () => {
    prismaMock.case.findFirst.mockResolvedValue({ id: 'case-1' });
    prismaMock.evidenceRecord.create.mockImplementation((args: any) => ({
      id: args.data.id,
      ...args.data,
    }));
    prismaMock.caseEvidence.create.mockResolvedValue({ id: 'link-1' });
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });

    const result = await service.createEvidence({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'eu-west-1',
      caseId: 'case-1',
      evidenceType: 'LOG_EXCERPT',
      title: 'Auth Failure Audit Log',
      rawContent: 'User auth failure at 2026-08-10T12:00:00Z',
      createdBy: 'analyst@acme.com',
    });

    expect(result.id).toBeDefined();
    expect(result.content_hash).toBeDefined();
    // Only real EvidenceRecord columns should ever be written.
    expect(prismaMock.evidenceRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          size_bytes: expect.any(Number),
          vault_reference: expect.stringContaining('s3://evidence-vault/'),
        }),
      }),
    );
    const createdData = prismaMock.evidenceRecord.create.mock.calls[0][0].data;
    expect(createdData).not.toHaveProperty('content_size_bytes');
    expect(createdData).not.toHaveProperty('storage_uri');
    expect(createdData).not.toHaveProperty('status');
    expect(createdData).not.toHaveProperty('added_by');

    expect(prismaMock.caseEvidence.create).toHaveBeenCalledWith({
      data: {
        tenant_id: 'tenant-1',
        case_id: 'case-1',
        evidence_id: result.id,
        added_by: 'analyst@acme.com',
      },
    });
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'evidence.created',
          tenant_id: 'tenant-1',
        }),
      }),
    );
  });

  it('rejects a caseId that does not belong to the tenant, before writing anything', async () => {
    prismaMock.case.findFirst.mockResolvedValue(null);

    await expect(
      service.createEvidence({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        region: 'eu-west-1',
        caseId: 'case-does-not-exist',
        evidenceType: 'LOG_EXCERPT',
        title: 'Auth Failure Audit Log',
        rawContent: 'User auth failure at 2026-08-10T12:00:00Z',
      }),
    ).rejects.toThrow("Case 'case-does-not-exist' not found for tenant 'tenant-1'");

    expect(prismaMock.evidenceRecord.create).not.toHaveBeenCalled();
  });

  it('creates evidence with no case link when caseId is omitted', async () => {
    prismaMock.evidenceRecord.create.mockImplementation((args: any) => ({
      id: args.data.id,
      ...args.data,
    }));
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'outbox-2' });

    await service.createEvidence({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'eu-west-1',
      evidenceType: 'LOG_EXCERPT',
      title: 'Standalone Log',
      rawContent: 'no case attached',
    });

    expect(prismaMock.case.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.caseEvidence.create).not.toHaveBeenCalled();
  });

  it('verifies stored cryptographic hash', async () => {
    prismaMock.evidenceRecord.findFirst.mockResolvedValue({
      id: 'ev-1',
      tenant_id: 'tenant-1',
      content_hash: 'abc123hash',
    });

    const verifyResult = await service.verifyEvidenceIntegrity(
      'tenant-1',
      'ev-1',
    );
    expect(verifyResult.isIntegrityValid).toBe(true);
    expect(verifyResult.storedHash).toBe('abc123hash');
  });
});
