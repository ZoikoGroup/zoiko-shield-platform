import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceDecayWorker } from './evidence-decay.worker';
import { PrismaService } from '../../prisma/prisma.service';

describe('EvidenceDecayWorker', () => {
  let worker: EvidenceDecayWorker;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      evidenceRecord: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commercialEvent: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceDecayWorker,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    worker = module.get<EvidenceDecayWorker>(EvidenceDecayWorker);
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  it('should scan for evidence older than 30 days, mark as DECAYED, and emit commercialEvent', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);

    const mockStaleRecords = [
      {
        id: 'ev-stale-001',
        tenant_id: 'tenant-alpha',
        evidence_type: 'IAM_MFA_ENFORCEMENT',
        source_object_id: 'src-obj-123',
        freshness_state: 'FRESH',
        created_at: oldDate,
      },
      {
        id: 'ev-stale-002',
        tenant_id: 'tenant-beta',
        evidence_type: 'S3_BUCKET_ENCRYPTION',
        source_object_id: 'src-obj-456',
        freshness_state: 'AGING',
        created_at: oldDate,
      },
    ];

    prismaMock.evidenceRecord.findMany.mockResolvedValue(mockStaleRecords);
    prismaMock.evidenceRecord.update.mockResolvedValue({});
    prismaMock.commercialEvent.create.mockResolvedValue({});

    const result = await worker.processEvidenceDecay();

    expect(result).toEqual({ scanned: 2, decayed: 2 });
    expect(prismaMock.evidenceRecord.findMany).toHaveBeenCalledWith({
      where: {
        created_at: { lt: expect.any(Date) },
        freshness_state: { notIn: ['DECAYED', 'ARCHIVED', 'EXPIRED'] },
      },
    });

    expect(prismaMock.evidenceRecord.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.evidenceRecord.update).toHaveBeenCalledWith({
      where: { id: 'ev-stale-001' },
      data: { freshness_state: 'DECAYED' },
    });
    expect(prismaMock.evidenceRecord.update).toHaveBeenCalledWith({
      where: { id: 'ev-stale-002' },
      data: { freshness_state: 'DECAYED' },
    });

    expect(prismaMock.commercialEvent.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.commercialEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_type: 'evidence.decayed',
        tenant_id: 'tenant-alpha',
        actor: 'system-evidence-decay-worker',
        idempotency_key: 'decay-ev-stale-001',
      }),
    });
  });

  it('should return { scanned: 0, decayed: 0 } when no stale evidence exists', async () => {
    prismaMock.evidenceRecord.findMany.mockResolvedValue([]);

    const result = await worker.processEvidenceDecay();

    expect(result).toEqual({ scanned: 0, decayed: 0 });
    expect(prismaMock.evidenceRecord.update).not.toHaveBeenCalled();
    expect(prismaMock.commercialEvent.create).not.toHaveBeenCalled();
  });
});
