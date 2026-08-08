import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EvidenceService } from '../services/evidence.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceLedgerService } from '../ledger/evidence-ledger.service';
import { EvidenceLineageService } from '../lineage/evidence-lineage.service';
import { EvidenceRepository } from '../repositories/evidence.repository';

describe('EvidenceService', () => {
  let service: EvidenceService;
  let prismaMock: any;
  let storageMock: any;
  let ledgerMock: any;
  let lineageMock: any;
  let evidenceRepoMock: any;

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
      evidenceRecord: { create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    storageMock = { buildObjectKey: jest.fn().mockReturnValue('tenant-a/evidence-x'), putObject: jest.fn().mockResolvedValue(undefined) };
    ledgerMock = { append: jest.fn().mockResolvedValue({ sequence: 1 }) };
    lineageMock = { link: jest.fn().mockResolvedValue(undefined) };
    evidenceRepoMock = { findById: jest.fn(), findByTenantAndId: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: new OutboxService() },
        ContentHashService,
        { provide: ObjectStorageService, useValue: storageMock },
        { provide: EvidenceLedgerService, useValue: ledgerMock },
        { provide: EvidenceLineageService, useValue: lineageMock },
        { provide: EvidenceRepository, useValue: evidenceRepoMock },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  it('stores bytes in object storage, writes an EvidenceRecord with integrity_state PENDING, and appends to the ledger', async () => {
    const evidence = await service.createEvidence({
      tenantId: 'tenant-a',
      evidenceType: 'ALERT_CREATION',
      producingService: 'test',
      sourceSystemId: 'sys-1',
      sourceObjectId: 'obj-1',
      purpose: 'INVESTIGATION',
      content: { foo: 'bar' },
    });

    expect(storageMock.putObject).toHaveBeenCalledTimes(1);
    expect(evidence.integrity_state).toBe('PENDING');
    expect(ledgerMock.append).toHaveBeenCalledTimes(1);
  });

  it('links lineage to a parent evidence record when parentEvidenceId is given', async () => {
    await service.createEvidence({
      tenantId: 'tenant-a',
      evidenceType: 'NORMALIZED_EVENT',
      producingService: 'test',
      sourceSystemId: 'sys-1',
      sourceObjectId: 'obj-1',
      purpose: 'INVESTIGATION',
      content: { foo: 'bar' },
      parentEvidenceId: 'evidence-parent',
      lineageRelationship: 'NORMALIZED_FROM',
    });

    expect(lineageMock.link).toHaveBeenCalledWith(
      expect.objectContaining({ parentEvidenceId: 'evidence-parent', relationship: 'NORMALIZED_FROM' }),
    );
  });

  it('rejects cross-tenant access — evidence belonging to tenant B is not returned to tenant A, even to answer not-found vs forbidden', async () => {
    evidenceRepoMock.findById.mockResolvedValue({ id: 'evidence-1', tenant_id: 'tenant-b' });

    await expect(service.assertTenantOwnership('tenant-a', 'evidence-1')).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for evidence that does not exist at all', async () => {
    evidenceRepoMock.findById.mockResolvedValue(null);

    await expect(service.assertTenantOwnership('tenant-a', 'missing')).rejects.toThrow(NotFoundException);
  });
});
