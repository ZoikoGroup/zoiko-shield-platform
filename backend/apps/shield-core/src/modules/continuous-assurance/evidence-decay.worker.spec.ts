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
        updateMany: jest.fn(),
      },
      commercialEvent: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
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

    prismaMock.evidenceRecord.findMany.mockResolvedValueOnce(mockStaleRecords);
    prismaMock.evidenceRecord.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.commercialEvent.createMany.mockResolvedValue({ count: 2 });

    const result = await worker.processEvidenceDecay();

    expect(result).toEqual({ scanned: 2, decayed: 2 });
    expect(prismaMock.evidenceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          created_at: { lt: expect.any(Date) },
          freshness_state: { notIn: ['DECAYED', 'ARCHIVED', 'EXPIRED'] },
        },
        take: 500,
      }),
    );
    // A short batch is the last one: no second scan.
    expect(prismaMock.evidenceRecord.findMany).toHaveBeenCalledTimes(1);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.evidenceRecord.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ev-stale-001', 'ev-stale-002'] } },
      data: { freshness_state: 'DECAYED' },
    });

    const { data, skipDuplicates } =
      prismaMock.commercialEvent.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual(
      expect.objectContaining({
        event_type: 'evidence.decayed',
        tenant_id: 'tenant-alpha',
        actor: 'system-evidence-decay-worker',
        idempotency_key: 'decay-ev-stale-001',
      }),
    );
  });

  it('keeps taking full batches until the backlog is drained', async () => {
    const fullBatch = Array.from({ length: 500 }, (_, i) => ({
      id: `ev-${i}`,
      tenant_id: 't-1',
      evidence_type: 'X',
      source_object_id: 'src',
      created_at: new Date(0),
    }));
    prismaMock.evidenceRecord.findMany
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce(fullBatch.slice(0, 3));
    prismaMock.evidenceRecord.updateMany
      .mockResolvedValueOnce({ count: 500 })
      .mockResolvedValueOnce({ count: 3 });
    prismaMock.commercialEvent.createMany.mockResolvedValue({});

    const result = await worker.processEvidenceDecay();

    expect(result).toEqual({ scanned: 503, decayed: 503 });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });

  it('stops instead of spinning when a full batch updates nothing', async () => {
    const fullBatch = Array.from({ length: 500 }, (_, i) => ({
      id: `ev-${i}`,
    }));
    prismaMock.evidenceRecord.findMany.mockResolvedValue(fullBatch);
    prismaMock.evidenceRecord.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.commercialEvent.createMany.mockResolvedValue({});

    const result = await worker.processEvidenceDecay();

    expect(result).toEqual({ scanned: 500, decayed: 0 });
    expect(prismaMock.evidenceRecord.findMany).toHaveBeenCalledTimes(1);
  });

  it('should return { scanned: 0, decayed: 0 } when no stale evidence exists', async () => {
    prismaMock.evidenceRecord.findMany.mockResolvedValue([]);

    const result = await worker.processEvidenceDecay();

    expect(result).toEqual({ scanned: 0, decayed: 0 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
