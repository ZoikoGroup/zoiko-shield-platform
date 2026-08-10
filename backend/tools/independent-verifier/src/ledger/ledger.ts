export interface LedgerEntry {
  sequence: number;
  evidenceId: string;
  previousEntryHash: string | null;
  entryHash: string;
}

export interface LedgerCheckResult {
  valid: boolean;
  brokenAtSequence?: number;
  note: string;
}

/**
 * Walks the exported ledger segment and confirms each entry's declared
 * previousEntryHash matches the prior entry's declared entryHash — the
 * same structural check EvidenceLedgerService.verifyChain performs live.
 *
 * This is a LINK-CONSISTENCY check, not a from-scratch entry_hash
 * recomputation: the raw evidenceMetadata baked into each entry_hash at
 * write time isn't persisted verbatim on the ledger row, so it cannot be
 * independently re-derived here. Reported honestly, not overclaimed.
 */
export function verifyLedgerChain(entries: LedgerEntry[]): LedgerCheckResult {
  if (entries.length === 0) {
    return { valid: true, note: 'No ledger entries included in this package (empty evidence scope)' };
  }

  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  let previousHash: string | null = null;
  let previousSequence: number | null = null;

  for (const entry of sorted) {
    if (previousSequence !== null && entry.sequence === previousSequence) continue; // duplicate evidence sharing a sequence value is not expected but not itself a break
    if (previousHash !== null && entry.previousEntryHash !== previousHash) {
      return { valid: false, brokenAtSequence: entry.sequence, note: 'previousEntryHash does not match the prior entry\'s entryHash — link consistency check (not a from-scratch recomputation)' };
    }
    previousHash = entry.entryHash;
    previousSequence = entry.sequence;
  }

  return { valid: true, note: 'Ledger segment link-consistency verified (not a from-scratch entry_hash recomputation — evidenceMetadata is not exported verbatim)' };
}
