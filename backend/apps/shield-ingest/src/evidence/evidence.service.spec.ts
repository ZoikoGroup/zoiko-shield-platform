import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../prisma/prisma.service';

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
      outboxEvent: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  it('creates evidence record and outbox event with SHA-256 hash', async () => {
    prismaMock.evidenceRecord.create.mockImplementation((args: any) => ({
      id: args.data.id,
      ...args.data,
    }));
    prismaMock.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });

    const result = await service.createEvidence({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'eu-west-1',
      caseId: 'case-1',
      evidenceType: 'LOG_EXCERPT',
      title: 'Auth Failure Audit Log',
      rawContent: 'User auth failure at 2026-08-10T12:00:00Z',
    });

    expect(result.id).toBeDefined();
    expect(result.content_hash).toBeDefined();
    expect(prismaMock.evidenceRecord.create).toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'evidence.created',
          tenant_id: 'tenant-1',
        }),
      }),
    );
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
