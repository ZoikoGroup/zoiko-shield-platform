import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EvidenceService (Step 12)', () => {
  let service: EvidenceService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      evidenceRecord: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      case: {
        findUnique: jest.fn(),
      },
      caseTimeline: {
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

  it('should create evidence record with SHA-256 hash and append EVIDENCE_LINKED to CaseTimeline', async () => {
    prismaMock.evidenceRecord.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'ev-1', ...data }),
    );
    prismaMock.case.findUnique.mockResolvedValue({ id: 'case-1' });

    const result = await service.createEvidence({
      tenantId: 'tenant-1',
      caseId: 'case-1',
      evidenceType: 'LOG_EXCERPT',
      title: 'Auth Failure Audit Log',
      rawContent: 'User auth failure at 2026-08-10T12:00:00Z',
    });

    expect(result.id).toBe('ev-1');
    expect(result.sha256_hash).toBeDefined();
    expect(prismaMock.caseTimeline.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_type: 'EVIDENCE_LINKED',
        case_id: 'case-1',
      }),
    });
  });

  it('should verify cryptographic SHA-256 hash integrity', async () => {
    const rawContent = 'Sensitive audit payload';
    const crypto = require('crypto');
    const expectedHash = crypto.createHash('sha256').update(rawContent).digest('hex');

    prismaMock.evidenceRecord.findUnique.mockResolvedValue({
      id: 'ev-1',
      raw_content: rawContent,
      sha256_hash: expectedHash,
    });

    const verifyResult = await service.verifyEvidenceIntegrity('ev-1');
    expect(verifyResult.isIntegrityValid).toBe(true);
    expect(verifyResult.recomputedHash).toBe(expectedHash);
  });
});
