import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceLedgerService } from '../ledger/evidence-ledger.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../hashing/content-hash.service';

describe('EvidenceLedgerService', () => {
  let service: EvidenceLedgerService;
  let prismaMock: any;
  let hashService: ContentHashService;

  beforeEach(async () => {
    prismaMock = {
      evidenceLedgerEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $transaction: jest
        .fn()
        .mockImplementation((callback: any) => callback(prismaMock)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceLedgerService,
        { provide: PrismaService, useValue: prismaMock },
        ContentHashService,
      ],
    }).compile();
    service = module.get<EvidenceLedgerService>(EvidenceLedgerService);
    hashService = module.get<ContentHashService>(ContentHashService);
  });

  const buildEntry = (
    sequence: number,
    previousEntryHash: string | null,
    evidenceId: string,
    evidenceMetadata: Record<string, unknown> = {},
  ) => {
    const entryHash = hashService.hashCanonicalJson({
      tenantId: 'tenant-a',
      sequence,
      evidenceId,
      previousEntryHash,
      evidenceMetadata,
    }).contentHash;
    return {
      sequence,
      evidence_id: evidenceId,
      previous_entry_hash: previousEntryHash,
      entry_hash: entryHash,
      entry_metadata: JSON.stringify(evidenceMetadata),
    };
  };

  it('starts the per-tenant chain at sequence 1 with no previous_entry_hash', async () => {
    prismaMock.evidenceLedgerEntry.findFirst.mockResolvedValue(null);
    prismaMock.evidenceLedgerEntry.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'entry-1', ...data }),
    );

    const entry = await service.append('tenant-a', 'evidence-1', {
      type: 'RAW',
    });

    expect(entry.sequence).toBe(1);
    expect(entry.previous_entry_hash).toBeUndefined();
  });

  it('chains sequence N+1 to commit the previous entry hash', async () => {
    prismaMock.evidenceLedgerEntry.findFirst.mockResolvedValue({
      sequence: 1,
      entry_hash: 'hash-1',
    });
    prismaMock.evidenceLedgerEntry.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'entry-2', ...data }),
    );

    const entry = await service.append('tenant-a', 'evidence-2', {
      type: 'RAW',
    });

    expect(entry.sequence).toBe(2);
    expect(entry.previous_entry_hash).toBe('hash-1');
  });

  it('verifyChain detects a broken link (simulated deletion/reorder) via hash mismatch', async () => {
    const first = buildEntry(1, null, 'evidence-1');
    const second = buildEntry(2, first.entry_hash, 'evidence-2');
    prismaMock.evidenceLedgerEntry.findMany.mockResolvedValue([
      first,
      second,
      // sequence 3's previous_entry_hash should be 'hash-2' but a deleted/reordered
      // entry 2 would leave a stale or wrong commitment here:
      buildEntry(3, 'WRONG-HASH', 'evidence-3'),
    ]);

    const result = await service.verifyChain('tenant-a');

    expect(result).toEqual({ valid: false, brokenAtSequence: 3 });
  });

  it('verifyChain reports valid=true for an intact chain', async () => {
    const first = buildEntry(1, null, 'evidence-1', { type: 'RAW' });
    const second = buildEntry(2, first.entry_hash, 'evidence-2', {
      type: 'NORMALIZED',
    });
    const third = buildEntry(3, second.entry_hash, 'evidence-3', {
      type: 'ALERT',
    });
    prismaMock.evidenceLedgerEntry.findMany.mockResolvedValue([
      first,
      second,
      third,
    ]);

    const result = await service.verifyChain('tenant-a');

    expect(result).toEqual({ valid: true });
  });
});
