import { createHash } from 'crypto';

export const EMAIL_AUDIT_GENESIS_HASH = '0'.repeat(64);

export interface EmailAuditChainFields {
  tenantId: string;
  seq: number;
  actorId: string;
  eventType: string;
  targetId: string | null;
  detail: unknown;
  createdAt: Date;
  prevHash: string;
}

/** Deterministic JSON: object keys sorted recursively so the hash is stable. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    .join(',')}}`;
}

export function computeEmailAuditHash(fields: EmailAuditChainFields): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        tenantId: fields.tenantId,
        seq: fields.seq,
        actorId: fields.actorId,
        eventType: fields.eventType,
        targetId: fields.targetId,
        detail: fields.detail,
        createdAt: fields.createdAt.toISOString(),
        prevHash: fields.prevHash,
      }),
    )
    .digest('hex');
}

export interface ChainedAuditRow {
  tenant_id: string;
  seq: number | null;
  actor_id: string;
  event_type: string;
  target_id: string | null;
  detail: unknown;
  created_at: Date;
  prev_hash: string | null;
  event_hash: string | null;
}

export interface AuditChainVerification {
  valid: boolean;
  checked: number;
  /** Rows written before the chain existed (seq null); reported, never hidden. */
  unchainedLegacyRows: number;
  firstBrokenSeq: number | null;
  reason: string | null;
}

/** Verify rows (any order) of ONE tenant against the hash chain. */
export function verifyEmailAuditChain(
  rows: ChainedAuditRow[],
): AuditChainVerification {
  const chained = rows
    .filter((r) => r.seq !== null)
    .sort((a, b) => (a.seq as number) - (b.seq as number));
  const legacy = rows.length - chained.length;
  let prev = EMAIL_AUDIT_GENESIS_HASH;
  let expectedSeq = chained.length > 0 ? (chained[0].seq as number) : 1;
  // A chain that does not start at 1 means earlier rows were removed.
  if (chained.length > 0 && expectedSeq !== 1) {
    return {
      valid: false,
      checked: 0,
      unchainedLegacyRows: legacy,
      firstBrokenSeq: expectedSeq,
      reason: 'CHAIN_HEAD_MISSING',
    };
  }
  for (const row of chained) {
    if (row.seq !== expectedSeq) {
      return {
        valid: false,
        checked: expectedSeq - 1,
        unchainedLegacyRows: legacy,
        firstBrokenSeq: expectedSeq,
        reason: 'SEQUENCE_GAP',
      };
    }
    if (row.prev_hash !== prev) {
      return {
        valid: false,
        checked: expectedSeq - 1,
        unchainedLegacyRows: legacy,
        firstBrokenSeq: row.seq,
        reason: 'PREV_HASH_MISMATCH',
      };
    }
    const recomputed = computeEmailAuditHash({
      tenantId: row.tenant_id,
      seq: row.seq as number,
      actorId: row.actor_id,
      eventType: row.event_type,
      targetId: row.target_id,
      detail: row.detail,
      createdAt: row.created_at,
      prevHash: prev,
    });
    if (recomputed !== row.event_hash) {
      return {
        valid: false,
        checked: expectedSeq - 1,
        unchainedLegacyRows: legacy,
        firstBrokenSeq: row.seq,
        reason: 'EVENT_HASH_MISMATCH',
      };
    }
    prev = row.event_hash as string;
    expectedSeq += 1;
  }
  return {
    valid: true,
    checked: chained.length,
    unchainedLegacyRows: legacy,
    firstBrokenSeq: null,
    reason: null,
  };
}
