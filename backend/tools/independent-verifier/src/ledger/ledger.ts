import { hashCanonicalJson } from '../hashing/hash';

export interface LedgerEntry {
  tenantId: string;
  sequence: number;
  evidenceId: string;
  previousEntryHash: string | null;
  entryHash: string;
  evidenceMetadata: Record<string, unknown>;
}

export interface LedgerCheckResult {
  valid: boolean;
  brokenAtSequence?: number;
  note: string;
}

/**
 * Recomputes each entry commitment and checks sequence/link continuity.
 */
export function verifyLedgerChain(entries: LedgerEntry[]): LedgerCheckResult {
  if (entries.length === 0) {
    return { valid: true, note: 'No ledger entries included in this package (empty evidence scope)' };
  }

  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  let previousHash: string | null = null;
  let previousSequence: number | null = null;

  for (const entry of sorted) {
    if (previousSequence !== null && entry.sequence !== previousSequence + 1) {
      return { valid: false, brokenAtSequence: entry.sequence, note: 'Ledger sequence is duplicated or non-contiguous' };
    }
    if (previousHash !== null && entry.previousEntryHash !== previousHash) {
      return { valid: false, brokenAtSequence: entry.sequence, note: 'previousEntryHash does not match the prior entry\'s entryHash' };
    }
    const recomputed = hashCanonicalJson({
      tenantId: entry.tenantId,
      sequence: entry.sequence,
      evidenceId: entry.evidenceId,
      previousEntryHash: entry.previousEntryHash,
      evidenceMetadata: entry.evidenceMetadata,
    }).contentHash;
    if (recomputed !== entry.entryHash) {
      return { valid: false, brokenAtSequence: entry.sequence, note: 'Ledger entry hash does not match its canonical material' };
    }
    previousHash = entry.entryHash;
    previousSequence = entry.sequence;
  }

  return { valid: true, note: 'Ledger sequence, links, and entry hashes independently recomputed' };
}
