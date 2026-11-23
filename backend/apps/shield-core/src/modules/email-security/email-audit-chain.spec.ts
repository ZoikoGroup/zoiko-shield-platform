import {
  ChainedAuditRow,
  computeEmailAuditHash,
  EMAIL_AUDIT_GENESIS_HASH,
  verifyEmailAuditChain,
} from './email-audit-chain';

function buildChain(n: number, tenant = 't-1'): ChainedAuditRow[] {
  const rows: ChainedAuditRow[] = [];
  let prev = EMAIL_AUDIT_GENESIS_HASH;
  for (let seq = 1; seq <= n; seq++) {
    const createdAt = new Date(Date.UTC(2026, 10, 23, 0, 0, seq));
    const base = {
      tenantId: tenant,
      seq,
      actorId: 'u-1',
      eventType: 'EVT',
      targetId: `x-${seq}`,
      detail: { b: 2, a: { d: 4, c: 3 } },
      createdAt,
      prevHash: prev,
    };
    const hash = computeEmailAuditHash(base);
    rows.push({
      tenant_id: tenant,
      seq,
      actor_id: 'u-1',
      event_type: 'EVT',
      target_id: `x-${seq}`,
      detail: { a: { c: 3, d: 4 }, b: 2 },
      created_at: createdAt,
      prev_hash: prev,
      event_hash: hash,
    });
    prev = hash;
  }
  return rows;
}

describe('email audit hash chain', () => {
  it('verifies an intact chain regardless of key order or row order', () => {
    const rows = buildChain(5).reverse();
    expect(verifyEmailAuditChain(rows)).toMatchObject({
      valid: true,
      checked: 5,
      firstBrokenSeq: null,
    });
  });

  it('detects a modified event', () => {
    const rows = buildChain(4);
    rows[2].event_type = 'TAMPERED';
    expect(verifyEmailAuditChain(rows)).toMatchObject({
      valid: false,
      firstBrokenSeq: 3,
      reason: 'EVENT_HASH_MISMATCH',
    });
  });

  it('detects a deleted event in the middle (sequence gap)', () => {
    const rows = buildChain(4).filter((r) => r.seq !== 2);
    expect(verifyEmailAuditChain(rows)).toMatchObject({
      valid: false,
      reason: 'SEQUENCE_GAP',
    });
  });

  it('detects deletion of the chain head', () => {
    const rows = buildChain(3).filter((r) => r.seq !== 1);
    expect(verifyEmailAuditChain(rows)).toMatchObject({
      valid: false,
      reason: 'CHAIN_HEAD_MISSING',
    });
  });

  it('detects a re-linked prev_hash', () => {
    const rows = buildChain(3);
    rows[1].prev_hash = 'f'.repeat(64);
    expect(verifyEmailAuditChain(rows)).toMatchObject({
      valid: false,
      reason: 'PREV_HASH_MISMATCH',
    });
  });

  it('reports legacy unchained rows instead of hiding them', () => {
    const legacy: ChainedAuditRow = {
      tenant_id: 't-1',
      seq: null,
      actor_id: 'u',
      event_type: 'OLD',
      target_id: null,
      detail: {},
      created_at: new Date(0),
      prev_hash: null,
      event_hash: null,
    };
    expect(verifyEmailAuditChain([legacy, ...buildChain(2)])).toMatchObject({
      valid: true,
      checked: 2,
      unchainedLegacyRows: 1,
    });
  });
});
