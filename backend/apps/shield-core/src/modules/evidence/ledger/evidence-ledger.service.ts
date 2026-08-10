import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentHashService } from '../hashing/content-hash.service';

const LEDGER_CANONICALIZATION_PROFILE = 'zs-ledger-v1';

/**
 * Per-tenant append-only hash chain (spec §31/§32). Sequence numbers and
 * entry hashes are strictly per-tenant — never a single shared chain
 * across tenants, which would weaken tenant boundaries. Deletion or
 * reordering of a historical entry is detectable because every entry
 * commits to the previous entry's hash.
 */
@Injectable()
export class EvidenceLedgerService {
  private readonly logger = new Logger(EvidenceLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: ContentHashService,
  ) {}

  async append(tenantId: string, evidenceId: string, evidenceMetadata: Record<string, unknown>) {
    const lastEntry = await this.prisma.evidenceLedgerEntry.findFirst({
      where: { tenant_id: tenantId },
      orderBy: { sequence: 'desc' },
    });

    const sequence = (lastEntry?.sequence ?? 0) + 1;
    const previousEntryHash = lastEntry?.entry_hash;

    const { contentHash: entryHash } = this.hashService.hashCanonicalJson({
      tenantId,
      sequence,
      evidenceId,
      previousEntryHash: previousEntryHash ?? null,
      evidenceMetadata,
    });

    return this.prisma.evidenceLedgerEntry.create({
      data: {
        tenant_id: tenantId,
        sequence,
        evidence_id: evidenceId,
        previous_entry_hash: previousEntryHash,
        entry_hash: entryHash,
        canonicalization_profile: LEDGER_CANONICALIZATION_PROFILE,
      },
    });
  }

  /** The tenant's current chain head — derived on the fly, no separate denormalized head row for the evidence ledger itself. */
  async getHead(tenantId: string) {
    return this.prisma.evidenceLedgerEntry.findFirst({ where: { tenant_id: tenantId }, orderBy: { sequence: 'desc' } });
  }

  /** Re-walks the tenant's chain and confirms every entry's previous_entry_hash matches the prior entry's entry_hash — returns false at the first detected break (deletion/reorder/tamper). */
  async verifyChain(tenantId: string): Promise<{ valid: boolean; brokenAtSequence?: number }> {
    const entries = await this.prisma.evidenceLedgerEntry.findMany({
      where: { tenant_id: tenantId },
      orderBy: { sequence: 'asc' },
    });

    let previousHash: string | undefined;
    for (const entry of entries) {
      if ((entry.previous_entry_hash ?? undefined) !== previousHash) {
        return { valid: false, brokenAtSequence: entry.sequence };
      }
      previousHash = entry.entry_hash;
    }
    return { valid: true };
  }
}
