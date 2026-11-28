import { NotFoundException } from '@nestjs/common';
import { ConnectorActivityService, summarizePayload } from './connector-activity.service';

const T = 'tenant-1';
const C = 'conn-1';
const NOW = new Date('2026-11-28T12:00:00Z');

const raw = (id: string, minsAgo: number, status = 'NORMALIZED', payload: unknown = {}) => ({
  id,
  received_at: new Date(NOW.getTime() - minsAgo * 60_000),
  processing_status: status,
  raw_payload_reference: typeof payload === 'string' ? payload : JSON.stringify(payload),
});

function build(opts: { connector?: unknown; rows?: any[]; normalized?: any[]; total?: number; last24h?: number } = {}) {
  const count = jest.fn(async ({ where }: any) => (where.received_at ? opts.last24h ?? 3 : opts.total ?? 10));
  const findMany = jest.fn().mockResolvedValue(opts.rows ?? []);
  const normalizedFindMany = jest.fn().mockResolvedValue(opts.normalized ?? []);
  const prisma: any = {
    connectorInstance: { findFirst: jest.fn().mockResolvedValue('connector' in opts ? opts.connector : { id: C }) },
    rawEvent: { count, findMany },
    normalizedEvent: { findMany: normalizedFindMany },
  };
  return { service: new ConnectorActivityService(prisma), prisma, count, findMany, normalizedFindMany };
}

describe('ConnectorActivityService.recent', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('returns totals, the last delivery time and the events, newest first, joined to what they were understood as', async () => {
    const { service } = build({
      rows: [raw('r2', 5, 'NORMALIZED', { ref: 'refs/heads/main' }), raw('r1', 60, 'QUARANTINED')],
      normalized: [
        { raw_event_id: 'r2', event_activity: 'GIT_PUSH', event_category: 'SOURCE_CONTROL', event_class: 'SOURCE_CONTROL_AUDIT', severity: 'INFORMATIONAL', outcome: 'SUCCESS', actor_user_id: 'alice', resource_id: 'acme/repo', resource_type: 'GIT_REPOSITORY' },
      ],
      total: 23,
      last24h: 3,
    });
    const r = await service.recent(T, C);

    expect(r.total).toBe(23);
    expect(r.last24h).toBe(3);
    expect(r.lastReceivedAt).toBe(new Date(NOW.getTime() - 5 * 60_000).toISOString());
    expect(r.events.map((e) => e.id)).toEqual(['r2', 'r1']);
    expect(r.events[0]).toMatchObject({ status: 'NORMALIZED', activity: 'GIT_PUSH', outcome: 'SUCCESS', actor: 'alice', resource: 'acme/repo', resourceType: 'GIT_REPOSITORY', details: { branch: 'main' } });
  });

  it('still lists a delivery that was never normalized (quarantined, or not processed yet)', async () => {
    const { service } = build({ rows: [raw('r1', 1, 'QUARANTINED')] });
    const r = await service.recent(T, C);
    expect(r.events[0]).toMatchObject({ id: 'r1', status: 'QUARANTINED', activity: null, actor: null, resource: null });
  });

  it('is empty, not an error, for a connector that has received nothing', async () => {
    const { service, normalizedFindMany } = build({ rows: [], total: 0, last24h: 0 });
    expect(await service.recent(T, C)).toEqual({ total: 0, last24h: 0, lastReceivedAt: null, events: [] });
    expect(normalizedFindMany).not.toHaveBeenCalled();
  });

  it('is scoped to the caller\'s tenant on every query, and refuses a connector from another tenant', async () => {
    const { service, prisma, count, findMany, normalizedFindMany } = build({ rows: [raw('r1', 1)] });
    await service.recent(T, C);
    expect(prisma.connectorInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: C, tenant_id: T } }));
    for (const [arg] of [...count.mock.calls, ...findMany.mock.calls, ...normalizedFindMany.mock.calls]) {
      expect(arg.where.tenant_id).toBe(T);
    }
    expect(findMany.mock.calls[0][0].where.connector_id).toBe(C);

    const other = build({ connector: null });
    await expect(other.service.recent('someone-else', C)).rejects.toBeInstanceOf(NotFoundException);
    expect(other.count).not.toHaveBeenCalled();
  });

  it('bounds the page size', async () => {
    const { service, findMany } = build();
    for (const [asked, expected] of [[undefined, 10], [0, 1], [-5, 1], [7.9, 7], [500, 50], [Number.NaN, 10]] as const) {
      findMany.mockClear();
      await service.recent(T, C, asked as number);
      expect(findMany.mock.calls[0][0].take).toBe(expected);
    }
  });

  it('counts the last 24 hours from now', async () => {
    const { service, count } = build();
    await service.recent(T, C);
    const windowed = count.mock.calls.map(([a]) => a.where.received_at?.gte).filter(Boolean)[0] as Date;
    expect(windowed.getTime()).toBe(NOW.getTime() - 24 * 3_600_000);
  });

  it('never returns the raw payload', async () => {
    const secretish = { ref: 'refs/heads/main', token: 'ghp_SHOULD_NEVER_APPEAR', repository: { full_name: 'a/b', private_key: 'nope' }, nested: { password: 'nope' } };
    const { service } = build({ rows: [raw('r1', 1, 'NORMALIZED', secretish)] });
    const json = JSON.stringify(await service.recent(T, C));
    expect(json).not.toMatch(/ghp_SHOULD_NEVER_APPEAR|private_key|password|nope/);
    expect(json).not.toContain('raw_payload');
  });
});

describe('summarizePayload', () => {
  it('lifts the readable parts of a GitHub push', () => {
    expect(
      summarizePayload(JSON.stringify({ ref: 'refs/heads/feature/x', repository: { full_name: 'acme/repo' }, sender: { login: 'alice' }, commits: [{}, {}, {}], head_commit: { message: 'Fix the thing\n\nlong body' } })),
    ).toEqual({ branch: 'feature/x', repository: 'acme/repo', sender: 'alice', commits: 3, message: 'Fix the thing' });
  });

  it('lifts the generic fields of a custom webhook', () => {
    expect(summarizePayload(JSON.stringify({ eventType: 'auth.failed_login', action: 'deny', password: 'x' }))).toEqual({ eventType: 'auth.failed_login', action: 'deny' });
  });

  it('clips long values and collapses whitespace', () => {
    const d = summarizePayload(JSON.stringify({ head_commit: { message: 'a'.repeat(500) } }));
    expect((d!.message as string).length).toBe(120);
    expect(summarizePayload(JSON.stringify({ action: 'one   two\tthree' }))).toEqual({ action: 'one two three' });
  });

  it('gives nothing for anything that is not an object with a known field', () => {
    for (const bad of [null, undefined, '', 'not json', '[1,2]', '"text"', '42', '{}', JSON.stringify({ unrelated: 1 }), JSON.stringify({ ref: 5 })]) {
      expect(summarizePayload(bad as any)).toBeNull();
    }
  });
});
