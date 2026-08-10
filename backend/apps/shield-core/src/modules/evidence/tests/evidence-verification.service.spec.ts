import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceVerificationService } from '../verification/evidence-verification.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceRepository } from '../repositories/evidence.repository';

describe('EvidenceVerificationService', () => {
  let service: EvidenceVerificationService;
  let prismaMock: any;
  let storageMock: any;
  let evidenceRepoMock: any;

  const storedEvidence = {
    id: 'evidence-1',
    tenant_id: 'tenant-a',
    vault_reference: 'tenant-a/evidence-1',
    content_hash: undefined as unknown as string,
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
      evidenceRecord: { update: jest.fn().mockResolvedValue({}) },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    storageMock = { getObject: jest.fn() };
    evidenceRepoMock = { findByTenantAndId: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceVerificationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: new OutboxService() },
        ContentHashService,
        { provide: ObjectStorageService, useValue: storageMock },
        { provide: EvidenceRepository, useValue: evidenceRepoMock },
      ],
    }).compile();

    service = module.get<EvidenceVerificationService>(EvidenceVerificationService);
  });

  it('marks integrity VERIFIED when the re-hashed stored bytes match the recorded content_hash', async () => {
    const bytes = Buffer.from('{"a":1}', 'utf-8');
    const hashService = new ContentHashService();
    const correctHash = hashService.hash(bytes);

    evidenceRepoMock.findByTenantAndId.mockResolvedValue({ ...storedEvidence, content_hash: correctHash });
    storageMock.getObject.mockResolvedValue(bytes);

    const result = await service.verify('tenant-a', 'evidence-1');

    expect(result.integrityState).toBe('VERIFIED');
    expect(prismaMock.evidenceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { integrity_state: 'VERIFIED' } }),
    );
  });

  it('marks integrity FAILED when stored bytes have been tampered with (changed content changes the hash)', async () => {
    const originalBytes = Buffer.from('{"a":1}', 'utf-8');
    const hashService = new ContentHashService();
    const originalHash = hashService.hash(originalBytes);

    evidenceRepoMock.findByTenantAndId.mockResolvedValue({ ...storedEvidence, content_hash: originalHash });
    // Storage returns different bytes than what was originally hashed —
    // simulates tampering/corruption after the fact.
    storageMock.getObject.mockResolvedValue(Buffer.from('{"a":999}', 'utf-8'));

    const result = await service.verify('tenant-a', 'evidence-1');

    expect(result.integrityState).toBe('FAILED');
    expect(prismaMock.evidenceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { integrity_state: 'FAILED' } }),
    );
  });
});
