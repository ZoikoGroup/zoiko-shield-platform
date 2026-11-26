import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConnectorWebhookSecretService } from './connector-webhook-secret.service';

jest.mock('../../../../../libs/database/src', () => ({
  runWithPlatformScope: (_reason: string, fn: () => unknown) => fn(),
}));

type Row = Record<string, any>;

/** Just enough of Prisma's where-language for the queries the service makes. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (cond !== null && typeof cond === 'object' && 'gt' in cond) {
      return row[key] != null && row[key] > cond.gt;
    }
    if (cond !== null && typeof cond === 'object' && 'in' in cond) {
      return (cond.in as unknown[]).includes(row[key]);
    }
    return row[key] === cond;
  });
}

function fakePrisma(connectors: Row[]) {
  const secrets: Row[] = [];
  let seq = 0;
  const table = {
    findFirst: async ({ where }: Row) =>
      secrets.find((r) => matches(r, where)) ?? null,
    findMany: async ({ where, orderBy, take }: Row) => {
      let out = secrets.filter((r) => matches(r, where));
      if (orderBy?.version === 'desc') out = out.sort((a, b) => b.version - a.version);
      return take ? out.slice(0, take) : out;
    },
    create: async ({ data }: Row) => {
      if (secrets.some((r) => r.instanceId === data.instanceId && r.version === data.version)) {
        throw new Error('unique violation');
      }
      const row = {
        id: `s${++seq}`,
        createdAt: new Date(),
        revealedAt: null,
        validUntil: null,
        rotatedAt: null,
        status: 'ACTIVE',
        ...data,
      };
      secrets.push(row);
      return row;
    },
    updateMany: async ({ where, data }: Row) => {
      const hit = secrets.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    },
    update: async ({ where, data }: Row) => {
      const row = secrets.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
  };
  const prisma: Row = {
    connectorInstance: {
      findFirst: async ({ where }: Row) =>
        connectors.find((c) => c.id === where.id && c.tenant_id === where.tenant_id) ?? null,
    },
    connectorWebhookSecret: table,
    $transaction: async (fn: (tx: Row) => unknown) => fn(prisma),
  };
  return { prisma, secrets };
}

describe('ConnectorWebhookSecretService', () => {
  const env = process.env;
  const TENANT = 'tenant-a';
  const CONNECTOR = 'conn-1';
  let svc: ConnectorWebhookSecretService;
  let secrets: Row[];

  beforeEach(() => {
    process.env = {
      ...env,
      NODE_ENV: 'test',
      CONNECTOR_SECRET_DEV_KEY: randomBytes(32).toString('base64'),
    };
    delete process.env.CONNECTOR_SECRET_KMS_KEY;
    delete process.env.WEBHOOK_SECRET_ROTATION_GRACE_HOURS;
    const fake = fakePrisma([
      { id: CONNECTOR, tenant_id: TENANT },
      { id: 'conn-2', tenant_id: 'tenant-b' },
    ]);
    secrets = fake.secrets;
    svc = new ConnectorWebhookSecretService(fake.prisma as any);
  });

  afterAll(() => {
    process.env = env;
  });

  it('stores the secret encrypted, never in the clear', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const [row] = secrets;
    const revealed = await svc.reveal(TENANT, CONNECTOR);

    expect(revealed.secret).toMatch(/^whsec_[A-Za-z0-9_-]{40,}$/);
    expect(JSON.stringify(row)).not.toContain(revealed.secret);
    expect(row.secret_hint).toBe(revealed.secret.slice(-4));
    expect(row.key_ref).toBe('dev-local');
  });

  it('issues only one active secret per connector', async () => {
    await svc.issue(TENANT, CONNECTOR);
    await svc.issue(TENANT, CONNECTOR);
    expect(secrets).toHaveLength(1);
  });

  it('gives each connector a different secret', async () => {
    await svc.issue(TENANT, CONNECTOR);
    await svc.issue('tenant-b', 'conn-2');
    const a = await svc.reveal(TENANT, CONNECTOR);
    const b = await svc.reveal('tenant-b', 'conn-2');
    expect(a.secret).not.toBe(b.secret);
  });

  it('reveals the secret exactly once', async () => {
    await svc.issue(TENANT, CONNECTOR);
    await expect(svc.reveal(TENANT, CONNECTOR)).resolves.toHaveProperty('secret');
    await expect(svc.reveal(TENANT, CONNECTOR)).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets only one of two simultaneous reveals win', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const results = await Promise.allSettled([
      svc.reveal(TENANT, CONNECTOR),
      svc.reveal(TENANT, CONNECTOR),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it("will not touch another tenant's connector", async () => {
    await svc.issue('tenant-b', 'conn-2');
    await expect(svc.status(TENANT, 'conn-2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.reveal(TENANT, 'conn-2')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.rotate(TENANT, 'conn-2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports status without the secret', async () => {
    expect(await svc.status(TENANT, CONNECTOR)).toEqual({ configured: false });
    await svc.issue(TENANT, CONNECTOR);
    const status = await svc.status(TENANT, CONNECTOR);
    expect(status).toMatchObject({ configured: true, version: 1, revealed: false });
    expect(JSON.stringify(status)).not.toContain('whsec_');
    await svc.reveal(TENANT, CONNECTOR);
    expect((await svc.status(TENANT, CONNECTOR)).revealed).toBe(true);
  });

  it('verifies with the secret it handed out', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const { secret } = await svc.reveal(TENANT, CONNECTOR);
    expect(await svc.verificationSecrets(CONNECTOR)).toEqual([secret]);
  });

  it('returns nothing for a connector that has no secret', async () => {
    expect(await svc.verificationSecrets('unknown')).toEqual([]);
  });

  it('rotates: new secret returned, old one still valid during the grace window', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const first = await svc.reveal(TENANT, CONNECTOR);
    const next = await svc.rotate(TENANT, CONNECTOR);

    expect(next.version).toBe(2);
    expect(next.secret).not.toBe(first.secret);
    expect(next.previousValidUntil!.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(await svc.verificationSecrets(CONNECTOR, { fresh: true })).toEqual([
      next.secret,
      first.secret,
    ]);
    // The rotate response is the one delivery of the new secret.
    await expect(svc.reveal(TENANT, CONNECTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(await svc.status(TENANT, CONNECTOR)).toMatchObject({ version: 2, hint: next.hint });
  });

  it('ends the old secret at once when rotated immediately', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const first = await svc.reveal(TENANT, CONNECTOR);
    const next = await svc.rotate(TENANT, CONNECTOR, { immediate: true });
    expect(await svc.verificationSecrets(CONNECTOR, { fresh: true })).toEqual([next.secret]);
    expect(await svc.verificationSecrets(CONNECTOR, { fresh: true })).not.toContain(first.secret);
  });

  it('stops accepting a rotated-out secret once its grace window has passed', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const first = await svc.reveal(TENANT, CONNECTOR);
    const next = await svc.rotate(TENANT, CONNECTOR);
    secrets.find((r) => r.version === 1)!.validUntil = new Date(Date.now() - 1000);
    expect(await svc.verificationSecrets(CONNECTOR, { fresh: true })).toEqual([next.secret]);
    expect(first.secret).not.toBe(next.secret);
  });

  it('a second rotation ends the secret from before the last one', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const first = await svc.reveal(TENANT, CONNECTOR);
    await svc.rotate(TENANT, CONNECTOR);
    const third = await svc.rotate(TENANT, CONNECTOR);
    const accepted = await svc.verificationSecrets(CONNECTOR, { fresh: true });
    expect(accepted).toContain(third.secret);
    expect(accepted).not.toContain(first.secret);
  });

  it('serves a recent lookup from cache until a fresh one is asked for', async () => {
    await svc.issue(TENANT, CONNECTOR);
    const { secret } = await svc.reveal(TENANT, CONNECTOR);
    await svc.verificationSecrets(CONNECTOR);
    secrets.length = 0; // gone from the database
    expect(await svc.verificationSecrets(CONNECTOR)).toEqual([secret]);
    expect(await svc.verificationSecrets(CONNECTOR, { fresh: true })).toEqual([]);
  });

  it('does not decrypt a row moved onto another connector (AAD binding)', async () => {
    await svc.issue(TENANT, CONNECTOR);
    secrets[0].instanceId = 'conn-elsewhere';
    expect(await svc.verificationSecrets('conn-elsewhere', { fresh: true })).toEqual([]);
  });

  it('stops verifying anything once the connector is retired', async () => {
    await svc.issue(TENANT, CONNECTOR);
    await svc.reveal(TENANT, CONNECTOR);
    await svc.rotate(TENANT, CONNECTOR); // leaves one rotated-out secret in its grace window
    expect(await svc.verificationSecrets(CONNECTOR, { fresh: true })).toHaveLength(2);

    await svc.revokeAll(TENANT, CONNECTOR);

    expect(await svc.verificationSecrets(CONNECTOR)).toEqual([]); // cache cleared too
    expect(secrets.every((r) => r.status === 'REVOKED')).toBe(true);
  });

  it("does not revoke another tenant's connector's secrets", async () => {
    await svc.issue('tenant-b', 'conn-2');
    await svc.revokeAll(TENANT, 'conn-2');
    expect(secrets[0].status).toBe('ACTIVE');
  });

  describe('key custody', () => {
    it('reports unconfigured outside production without a key', () => {
      delete process.env.CONNECTOR_SECRET_DEV_KEY;
      const fake = fakePrisma([]);
      expect(new ConnectorWebhookSecretService(fake.prisma as any).isConfigured()).toBe(false);
    });

    it('rejects a dev key of the wrong length', () => {
      process.env.CONNECTOR_SECRET_DEV_KEY = randomBytes(16).toString('base64');
      expect(new ConnectorWebhookSecretService(fakePrisma([]).prisma as any).isConfigured()).toBe(false);
    });

    it('fails closed in production without KMS, even with a dev key set', () => {
      process.env.NODE_ENV = 'production';
      expect(new ConnectorWebhookSecretService(fakePrisma([]).prisma as any).isConfigured()).toBe(false);
    });

    it('refuses to fall back to other secrets when stored ones cannot be read', async () => {
      await svc.issue(TENANT, CONNECTOR);
      const { prisma } = fakePrisma([{ id: CONNECTOR, tenant_id: TENANT }]);
      await prisma.connectorWebhookSecret.create({
        data: { tenant_id: TENANT, instanceId: CONNECTOR, version: 1, status: 'ACTIVE' },
      });
      delete process.env.CONNECTOR_SECRET_DEV_KEY;
      const blind = new ConnectorWebhookSecretService(prisma as any);
      await expect(blind.verificationSecrets(CONNECTOR, { fresh: true })).rejects.toThrow(
        /VAULT_NOT_CONFIGURED/
      );
    });
  });
});
