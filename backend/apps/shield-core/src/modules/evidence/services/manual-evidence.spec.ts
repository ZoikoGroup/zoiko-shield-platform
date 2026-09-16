import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { ContentHashService } from '../hashing/content-hash.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { EvidenceLedgerService } from '../ledger/evidence-ledger.service';
import { EvidenceLineageService } from '../lineage/evidence-lineage.service';
import { EvidenceRepository } from '../repositories/evidence.repository';
import { CollectorSignatureService } from '../signing/collector-signature.service';

/**
 * Manual (human-submitted) evidence must be distinguishable from automated
 * collection at the record level, and must still go through the same hash +
 * vault path as everything else (ZS-ENG-EVID-001 §08).
 */
describe('EvidenceService manual submissions', () => {
  let service: EvidenceService;
  let prismaMock: any;
  let storageMock: any;
  let repositoryMock: any;

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(async (cb: any) =>
        cb({
          evidenceRecord: {
            create: jest.fn(async ({ data }: any) => data),
            findFirst: jest.fn().mockResolvedValue(null),
          },
          outboxEvent: { create: jest.fn().mockResolvedValue({}) },
          caseEvidence: { create: jest.fn().mockResolvedValue({}) },
          caseTimelineEntry: { create: jest.fn().mockResolvedValue({}) },
          case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        }),
      ),
      evidenceRecord: {
        update: jest.fn(async ({ data }: any) => ({ id: 'ev-1', ...data })),
      },
    };
    storageMock = {
      buildObjectKey: jest.fn(() => 'tenant-a/ev-1'),
      putObject: jest.fn().mockResolvedValue(undefined),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    repositoryMock = {
      findByTenantAndId: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        ContentHashService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OutboxService, useValue: new OutboxService() },
        { provide: ObjectStorageService, useValue: storageMock },
        {
          provide: EvidenceLedgerService,
          useValue: { appendInTransaction: jest.fn().mockResolvedValue({}) },
        },
        { provide: EvidenceLineageService, useValue: { link: jest.fn() } },
        { provide: EvidenceRepository, useValue: repositoryMock },
        {
          provide: CollectorSignatureService,
          useValue: {
            sign: jest.fn().mockResolvedValue(null),
            verify: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get(EvidenceService);
  });

  const manualInput = {
    tenantId: 'tenant-a',
    environmentId: 'env-1',
    region: 'us-east-1',
    evidenceType: 'SCREENSHOT',
    producingService: 'manual-upload:analyst@acme.test',
    sourceSystemId: 'manual-upload',
    sourceObjectId: 'proof.png',
    purpose: 'AUDIT',
    rawContent: Buffer.from('raw file bytes'),
    mediaType: 'image/png',
    collectionMethod: 'MANUAL' as const,
    uploaderIdentity: 'analyst-1',
    uploadReason: 'Auditor asked for the console screenshot',
    manualReviewRequired: true,
  };

  it('marks a human upload MANUAL with its uploader, reason and review flag', async () => {
    const created: any = await service.createEvidence(manualInput);

    expect(created.collection_method).toBe('MANUAL');
    expect(created.uploader_identity).toBe('analyst-1');
    expect(created.upload_reason).toBe(
      'Auditor asked for the console screenshot',
    );
    expect(created.manual_review_required).toBe(true);
  });

  it('stores the uploaded bytes verbatim and hashes exactly what was stored', async () => {
    const created: any = await service.createEvidence(manualInput);

    const [, storedBytes, storedType] = storageMock.putObject.mock.calls[0];
    expect(storedBytes).toEqual(Buffer.from('raw file bytes'));
    expect(storedType).toBe('image/png');
    expect(created.size_bytes).toBe(Buffer.byteLength('raw file bytes'));

    // Re-hashing the same bytes must reproduce the stored hash, or verify()
    // would fail on a record that was never tampered with.
    const hash = new ContentHashService().hash(Buffer.from('raw file bytes'));
    expect(created.content_hash).toBe(hash);
  });

  it('defaults automated collection when nothing says otherwise', async () => {
    const created: any = await service.createEvidence({
      tenantId: 'tenant-a',
      environmentId: 'env-1',
      region: 'us-east-1',
      evidenceType: 'ALERT_CREATION',
      producingService: 'collector',
      sourceSystemId: 'shield-ingest',
      sourceObjectId: 'alert-1',
      purpose: 'INVESTIGATION',
      content: { alertId: 'alert-1' },
    });

    expect(created.collection_method).toBe('AUTOMATED');
    expect(created.manual_review_required).toBe(false);
  });

  it('rejects evidence with neither structured content nor bytes', async () => {
    await expect(
      service.createEvidence({
        tenantId: 'tenant-a',
        environmentId: 'env-1',
        region: 'us-east-1',
        evidenceType: 'SCREENSHOT',
        producingService: 'x',
        sourceSystemId: 'y',
        sourceObjectId: 'z',
        purpose: 'AUDIT',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(storageMock.putObject).not.toHaveBeenCalled();
  });

  it('refuses to let the uploader sign off their own manual evidence', async () => {
    repositoryMock.findByTenantAndId.mockResolvedValue({
      id: 'ev-1',
      collection_method: 'MANUAL',
      uploader_identity: 'analyst-1',
      upload_reason: 'because',
    });

    await expect(
      service.recordManualReview({
        tenantId: 'tenant-a',
        evidenceId: 'ev-1',
        reviewerId: 'analyst-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('clears the review flag when a different reviewer signs off', async () => {
    repositoryMock.findByTenantAndId.mockResolvedValue({
      id: 'ev-1',
      collection_method: 'MANUAL',
      uploader_identity: 'analyst-1',
      upload_reason: 'because',
    });

    const reviewed: any = await service.recordManualReview({
      tenantId: 'tenant-a',
      evidenceId: 'ev-1',
      reviewerId: 'soc-lead',
      comments: 'matches the console',
    });

    expect(reviewed.manual_review_required).toBe(false);
    expect(reviewed.manual_reviewed_by).toBe('soc-lead');
    expect(reviewed.manual_reviewed_at).toBeInstanceOf(Date);
  });

  it('rejects manual review of automatically collected evidence', async () => {
    repositoryMock.findByTenantAndId.mockResolvedValue({
      id: 'ev-1',
      collection_method: 'AUTOMATED',
    });

    await expect(
      service.recordManualReview({
        tenantId: 'tenant-a',
        evidenceId: 'ev-1',
        reviewerId: 'soc-lead',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
