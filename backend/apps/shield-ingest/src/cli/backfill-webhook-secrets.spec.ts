import {
  parseBackfillArgs,
  runBackfill,
} from './backfill-webhook-secrets';

// The module under test starts a Nest app only inside runBackfillCli; the
// helpers below are pure, so nothing else is needed.
jest.mock('../../../../libs/database/src', () => ({
  runWithPlatformScope: (_r: string, fn: () => unknown) => fn(),
}));

const A = { id: 'conn-a', tenant_id: 'tenant-1', name: 'github' };
const B = { id: 'conn-b', tenant_id: 'tenant-2', name: 'okta' };

function deps(over: { rows?: unknown[]; configured?: boolean; issue?: jest.Mock } = {}) {
  const findMany = jest.fn().mockResolvedValue(over.rows ?? [A, B]);
  const issue = over.issue ?? jest.fn().mockResolvedValue(undefined);
  const lines: string[] = [];
  return {
    findMany,
    issue,
    lines,
    d: {
      prisma: { connectorInstance: { findMany } } as any,
      secrets: { issue, isConfigured: () => over.configured ?? true } as any,
      out: (l: string) => lines.push(l),
    },
  };
}

describe('parseBackfillArgs', () => {
  it('is a dry run unless --apply is given', () => {
    expect(parseBackfillArgs(['node', 'main.js', '--backfill-webhook-secrets'])).toEqual({
      apply: false,
      tenantId: undefined,
    });
    expect(parseBackfillArgs(['--backfill-webhook-secrets', '--apply']).apply).toBe(true);
  });
  it('reads --tenant and rejects it without a value', () => {
    expect(parseBackfillArgs(['--tenant', 't-9']).tenantId).toBe('t-9');
    expect(() => parseBackfillArgs(['--tenant'])).toThrow(/needs a tenant id/);
    expect(() => parseBackfillArgs(['--tenant', '--apply'])).toThrow(/needs a tenant id/);
  });
});

describe('runBackfill', () => {
  it('only looks for live webhook connectors that have no active secret', async () => {
    const { d, findMany } = deps();
    await runBackfill(d, { apply: false });
    expect(findMany.mock.calls[0][0].where).toEqual({
      authentication_type: 'WEBHOOK_SECRET',
      deletedAt: null,
      webhookSecrets: { none: { status: 'ACTIVE' } },
    });
  });

  it('can be limited to one tenant', async () => {
    const { d, findMany } = deps();
    await runBackfill(d, { apply: false, tenantId: 'tenant-1' });
    expect(findMany.mock.calls[0][0].where.tenant_id).toBe('tenant-1');
  });

  it('changes nothing in a dry run, and says so', async () => {
    const { d, issue, lines } = deps();
    const r = await runBackfill(d, { apply: false });
    expect(issue).not.toHaveBeenCalled();
    expect(r.issued).toBe(0);
    expect(lines.join('\n')).toMatch(/2 webhook connector\(s\)/);
    expect(lines.join('\n')).toMatch(/Dry run: nothing was changed/);
  });

  it('warns in a dry run when the vault is not configured', async () => {
    const { d, lines } = deps({ configured: false });
    await runBackfill(d, { apply: false });
    expect(lines.join('\n')).toMatch(/CONNECTOR_SECRET_KMS_KEY/);
  });

  it('creates a secret for each connector with --apply', async () => {
    const { d, issue } = deps();
    const r = await runBackfill(d, { apply: true });
    expect(issue.mock.calls).toEqual([['tenant-1', 'conn-a'], ['tenant-2', 'conn-b']]);
    expect(r.issued).toBe(2);
    expect(r.failed).toEqual([]);
  });

  it('refuses to apply, changing nothing, when the vault is not configured', async () => {
    const { d, issue } = deps({ configured: false });
    await expect(runBackfill(d, { apply: true })).rejects.toThrow(/vault is not configured/);
    expect(issue).not.toHaveBeenCalled();
  });

  it('keeps going after one connector fails and reports it', async () => {
    const issue = jest.fn().mockRejectedValueOnce(new Error('kms unavailable')).mockResolvedValue(undefined);
    const { d, lines } = deps({ issue });
    const r = await runBackfill(d, { apply: true });
    expect(r.issued).toBe(1);
    expect(r.failed).toEqual([{ id: 'conn-a', error: 'kms unavailable' }]);
    expect(lines.join('\n')).toMatch(/FAILED conn-a: kms unavailable/);
  });

  it('is a no-op when every connector already has a secret', async () => {
    const { d, issue, lines } = deps({ rows: [] });
    const r = await runBackfill(d, { apply: true });
    expect(issue).not.toHaveBeenCalled();
    expect(r.issued).toBe(0);
    expect(lines.join('\n')).toMatch(/0 webhook connector\(s\)/);
  });

  it('never prints a secret (issue() returns nothing to print)', async () => {
    const { d, lines } = deps();
    await runBackfill(d, { apply: true });
    expect(lines.join('\n')).not.toMatch(/whsec_/);
  });
});
