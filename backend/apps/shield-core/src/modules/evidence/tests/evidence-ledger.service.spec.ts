import { Test, TestingModule } from '@nestjs/testing';
import { EvidenceLedgerService } from '../ledger/evidence-ledger.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../hashing/content-hash.service';

describe('EvidenceLedgerService', () => {
  let service: EvidenceLedgerService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      evidenceLedgerEntry: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceLedgerService,
        { provide: PrismaService, useValue: prismaMock },
        ContentHashService,
      ],
    }).compile();
    service = module.get<EvidenceLedgerService>(EvidenceLedgerService);
  });

  it('starts the per-tenant chain at sequence 1 with no previous_entry_hash', async () => {
    prismaMock.evidenceLedgerEntry.findFirst.mockResolvedValue(null);
    prismaMock.evidenceLedgerEntry.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'entry-1', ...data }));

    const entry = await service.append('tenant-a', 'evidence-1', { type: 'RAW' });

    expect(entry.sequence).toBe(1);
    expect(entry.previous_entry_hash).toBeUndefined();
  });

  it('chains sequence N+1 to commit the previous entry hash', async () => {
    prismaMock.evidenceLedgerEntry.findFirst.mockResolvedValue({ sequence: 1, entry_hash: 'hash-1' });
    prismaMock.evidenceLedgerEntry.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'entry-2', ...data }));

    const entry = await service.append('tenant-a', 'evidence-2', { type: 'RAW' });

    expect(entry.sequence).toBe(2);
    expect(entry.previous_entry_hash).toBe('hash-1');
  });

  it('verifyChain detects a broken link (simulated deletion/reorder) via hash mismatch', async () => {
    prismaMock.evidenceLedgerEntry.findMany.mockResolvedValue([
      { sequence: 1, previous_entry_hash: null, entry_hash: 'hash-1' },
      { sequence: 2, previous_entry_hash: 'hash-1', entry_hash: 'hash-2' },
      // sequence 3's previous_entry_hash should be 'hash-2' but a deleted/reordered
      // entry 2 would leave a stale or wrong commitment here:
      { sequence: 3, previous_entry_hash: 'WRONG-HASH', entry_hash: 'hash-3' },
    ]);

    const result = await service.verifyChain('tenant-a');

    expect(result).toEqual({ valid: false, brokenAtSequence: 3 });
  });

  it('verifyChain reports valid=true for an intact chain', async () => {
    prismaMock.evidenceLedgerEntry.findMany.mockResolvedValue([
      { sequence: 1, previous_entry_hash: null, entry_hash: 'hash-1' },
      { sequence: 2, previous_entry_hash: 'hash-1', entry_hash: 'hash-2' },
      { sequence: 3, previous_entry_hash: 'hash-2', entry_hash: 'hash-3' },
    ]);

    const result = await service.verifyChain('tenant-a');

    expect(result).toEqual({ valid: true });
  });
});
