import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceService as CanonicalEvidenceService } from '../../../shield-core/src/modules/evidence/services/evidence.service';
import { EvidenceVerificationService } from '../../../shield-core/src/modules/evidence/verification/evidence-verification.service';

describe('EvidenceService (Step 12)', () => {
  let service: EvidenceService;
  let prismaMock: any;
  let canonicalEvidenceMock: any;
  let verificationMock: any;

  beforeEach(async () => {
    prismaMock = {
      evidenceRecord: { findMany: jest.fn() },
    };
    canonicalEvidenceMock = {
      createEvidence: jest.fn(),
      getById: jest.fn(),
    };
    verificationMock = { verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CanonicalEvidenceService, useValue: canonicalEvidenceMock },
        { provide: EvidenceVerificationService, useValue: verificationMock },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  it('routes evidence creation through the canonical object-store, ledger, and outbox write path', async () => {
    canonicalEvidenceMock.createEvidence.mockResolvedValue({ id: 'ev-1', content_hash: 'sha256' });

    const result = await service.createEvidence({
      tenantId: 'tenant-1',
      environmentId: 'env-1',
      region: 'eu-west-1',
      caseId: 'case-1',
      evidenceType: 'LOG_EXCERPT',
      title: 'Auth Failure Audit Log',
      rawContent: 'User auth failure at 2026-08-10T12:00:00Z',
    });

    expect(result.id).toBe('ev-1');
    expect(canonicalEvidenceMock.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        environmentId: 'env-1',
        region: 'eu-west-1',
        caseId: 'case-1',
        content: expect.objectContaining({ rawContent: 'User auth failure at 2026-08-10T12:00:00Z' }),
      }),
    );
  });

  it('re-reads object bytes through the canonical independent verification path', async () => {
    verificationMock.verify.mockResolvedValue({
      integrityState: 'VERIFIED',
      contentHash: 'expected-hash',
      storedHash: 'expected-hash',
    });

    const verifyResult = await service.verifyEvidenceIntegrity('tenant-1', 'ev-1');
    expect(verifyResult.isIntegrityValid).toBe(true);
    expect(verifyResult.recomputedHash).toBe('expected-hash');
    expect(verificationMock.verify).toHaveBeenCalledWith('tenant-1', 'ev-1');
  });
});
