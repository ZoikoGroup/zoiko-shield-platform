import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  TenantScopedPool,
  runWithPlatformScope,
  runWithTenantScope,
} from '../../../libs/database/src';
import { discoverTenantKeyedTables } from '../src/modules/offboarding/tenant-keyed-tables';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const policy = require('../../../prisma/access/access-policy') as {
  TABLES: Record<string, { kind: string }>;
};

/**
 * Tenant isolation against a real PostgreSQL: the negative tests spec §15
 * requires ("cross-tenant negative tests", "tenant-filter enforcement below
 * the application query layer").
 *
 * Needs RLS_TEST_DATABASE_URL: a DISPOSABLE database, as its owner, with
 * `npm run migrate:deploy` applied. The test creates and drops login roles.
 * Run with `npm run test:rls`.
 */
const OWNER_URL = process.env.RLS_TEST_DATABASE_URL;
if (!OWNER_URL) {
  throw new Error(
    'RLS_TEST_DATABASE_URL is required: a disposable, migrated database (npm run migrate:deploy)',
  );
}

const PROBE_PASSWORD = 'rls-probe';
const ROLES = {
  core: 'rls_probe_core',
  ai: 'rls_probe_ai',
  outsider: 'rls_probe_outsider',
};
const loginUrl = (role: string) => {
  const url = new URL(OWNER_URL);
  url.username = role;
  url.password = PROBE_PASSWORD;
  return url.toString();
};

describe('tenant row-level security (real PostgreSQL)', () => {
  const run = `rls-${Date.now()}`;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const ids = {
    sharedFreeze: `${run}-freeze-shared`,
    freezeA: `${run}-freeze-a`,
    freezeB: `${run}-freeze-b`,
    catalog: `${run}-catalog`,
    account: `${run}-account`,
    binding: `${run}-binding`,
    contract: `${run}-contract`,
    invoice: `${run}-invoice`,
    dunningPolicy: `${run}-dunning-policy`,
    dunningCase: `${run}-dunning-case`,
  };

  let owner: Client;
  let prisma: PrismaClient;

  const freezeIds = async () =>
    (
      await prisma.freeze.findMany({
        where: { id: { startsWith: run } },
        orderBy: { id: 'asc' },
      })
    ).map((f) => f.id);

  beforeAll(async () => {
    owner = new Client({ connectionString: OWNER_URL });
    await owner.connect();
    await owner.query(`SELECT set_config('app.platform_scope', 'on', false)`);
    for (const role of Object.values(ROLES)) {
      await owner.query(`DROP ROLE IF EXISTS ${role}`);
      await owner.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${PROBE_PASSWORD}'`,
      );
    }
    await owner.query(`GRANT shield_core_app TO ${ROLES.core}`);
    await owner.query(`GRANT shield_ai_app TO ${ROLES.ai}`);
    // Table privileges but no shield_platform_scope membership.
    await owner.query(
      `GRANT USAGE ON SCHEMA response_proposal, shield_rls TO ${ROLES.outsider}`,
    );
    await owner.query(
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shield_rls TO ${ROLES.outsider}`,
    );
    await owner.query(
      `GRANT SELECT ON response_proposal."Freeze" TO ${ROLES.outsider}`,
    );

    const freeze = (id: string, tenant: string | null) =>
      owner.query(
        `INSERT INTO response_proposal."Freeze"(id, tenant_id, scope, reason, created_by) VALUES ($1, $2, 'TENANT', 'rls test', 'rls test')`,
        [id, tenant],
      );
    await freeze(ids.sharedFreeze, null);
    await freeze(ids.freezeA, tenantA);
    await freeze(ids.freezeB, tenantB);
    for (const tenant of [tenantA, tenantB]) {
      await owner.query(
        `INSERT INTO tenant.environments("tenantId", name, "environmentType", region) VALUES ($1, $2, 'PRODUCTION', 'europe-west3')`,
        [tenant, `${run}-env`],
      );
    }
    await owner.query(
      `INSERT INTO catalog."CatalogVersion"(id, version_label) VALUES ($1, $1)`,
      [ids.catalog],
    );
    await owner.query(
      `INSERT INTO commercial."CommercialAccount"(id, name, customer_legal_name, updated_at) VALUES ($1, $1, $1, now())`,
      [ids.account],
    );
    await owner.query(
      `INSERT INTO commercial."CommercialAccountTenantBinding"(id, commercial_account_id, tenant_id, environment_id, status, updated_at) VALUES ($1, $2, $3, 'env-1', 'ACTIVE', now())`,
      [ids.binding, ids.account, tenantA],
    );
    await owner.query(
      `INSERT INTO commerce."Contract"(id, commercial_account_id, catalog_version_id, term_end, updated_at) VALUES ($1, $2, $3, now() + interval '1 year', now())`,
      [ids.contract, ids.account, ids.catalog],
    );
    await owner.query(
      `INSERT INTO billing."CommercialInvoice"(id, commercial_account_id, contract_id, updated_at) VALUES ($1, $2, $3, now())`,
      [ids.invoice, ids.account, ids.contract],
    );
    await owner.query(
      `INSERT INTO dunning."DunningPolicy"(id, policy_key) VALUES ($1, $1)`,
      [ids.dunningPolicy],
    );
    await owner.query(
      `INSERT INTO dunning."DunningCase"(id, contract_id, dunning_policy_id, updated_at) VALUES ($1, $2, $3, now())`,
      [ids.dunningCase, ids.contract, ids.dunningPolicy],
    );

    prisma = new PrismaClient({
      adapter: new PrismaPg(
        new TenantScopedPool({
          connectionString: loginUrl(ROLES.core),
          max: 4,
        }),
      ),
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (!owner) return;
    await owner.query(`DELETE FROM dunning."DunningCase" WHERE id = $1`, [
      ids.dunningCase,
    ]);
    await owner.query(`DELETE FROM dunning."DunningPolicy" WHERE id = $1`, [
      ids.dunningPolicy,
    ]);
    await owner.query(`DELETE FROM billing."CommercialInvoice" WHERE id = $1`, [
      ids.invoice,
    ]);
    await owner.query(`DELETE FROM commerce."Contract" WHERE id = $1`, [
      ids.contract,
    ]);
    await owner.query(
      `DELETE FROM commercial."CommercialAccountTenantBinding" WHERE id = $1`,
      [ids.binding],
    );
    await owner.query(
      `DELETE FROM commercial."CommercialAccount" WHERE id = $1`,
      [ids.account],
    );
    await owner.query(`DELETE FROM catalog."CatalogVersion" WHERE id = $1`, [
      ids.catalog,
    ]);
    await owner.query(`DELETE FROM tenant.environments WHERE name = $1`, [
      `${run}-env`,
    ]);
    await owner.query(
      `DELETE FROM response_proposal."Freeze" WHERE id LIKE $1`,
      [`${run}%`],
    );
    for (const role of Object.values(ROLES)) {
      await owner.query(`DROP OWNED BY ${role}`);
      await owner.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await owner.end();
  });

  describe('fail-closed', () => {
    it('hides every tenant row from work with no scope', async () => {
      expect(await freezeIds()).toEqual([ids.sharedFreeze]);
      expect(
        await prisma.environment.count({ where: { name: `${run}-env` } }),
      ).toBe(0);
      expect(
        await prisma.commercialInvoice.count({ where: { id: ids.invoice } }),
      ).toBe(0);
    });

    it('rejects an unscoped insert of a tenant row', async () => {
      await expect(
        prisma.freeze.create({
          data: {
            id: `${run}-unscoped`,
            tenant_id: tenantA,
            scope: 'TENANT',
            reason: 'x',
            created_by: 'x',
          },
        }),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe('tenant scope', () => {
    it("sees its own rows and shared definitions, never another tenant's", async () => {
      expect(await runWithTenantScope(tenantA, freezeIds)).toEqual([
        ids.freezeA,
        ids.sharedFreeze,
      ]);
      expect(await runWithTenantScope(tenantB, freezeIds)).toEqual([
        ids.freezeB,
        ids.sharedFreeze,
      ]);
    });

    it('applies to uuid-keyed tenant tables', async () => {
      const envs = await runWithTenantScope(tenantA, () =>
        prisma.environment.findMany({ where: { name: `${run}-env` } }),
      );
      expect(envs.map((e) => e.tenantId)).toEqual([tenantA]);
    });

    it("cannot write, change or delete another tenant's or a shared row", async () => {
      await runWithTenantScope(tenantA, async () => {
        await expect(
          prisma.freeze.create({
            data: {
              id: `${run}-forged`,
              tenant_id: tenantB,
              scope: 'TENANT',
              reason: 'x',
              created_by: 'x',
            },
          }),
        ).rejects.toThrow(/row-level security/);
        expect(
          (
            await prisma.freeze.updateMany({
              where: { id: ids.freezeB },
              data: { reason: 'tampered' },
            })
          ).count,
        ).toBe(0);
        expect(
          (await prisma.freeze.deleteMany({ where: { id: ids.sharedFreeze } }))
            .count,
        ).toBe(0);
        expect(
          (
            await prisma.freeze.updateMany({
              where: { id: ids.sharedFreeze },
              data: { reason: 'tampered' },
            })
          ).count,
        ).toBe(0);
      });
      expect(await runWithPlatformScope('rls test check', freezeIds)).toContain(
        ids.sharedFreeze,
      );
    });

    it('holds inside an interactive transaction', async () => {
      const seen = await runWithTenantScope(tenantB, () =>
        prisma.$transaction(async (tx) =>
          (await tx.freeze.findMany({ where: { id: { startsWith: run } } }))
            .map((f) => f.id)
            .sort(),
        ),
      );
      expect(seen).toEqual([ids.freezeB, ids.sharedFreeze].sort());
    });

    it('never lets one unit of work see another tenant on a shared pool', async () => {
      const expected = (i: number) =>
        i % 2
          ? [ids.freezeB, ids.sharedFreeze]
          : [ids.freezeA, ids.sharedFreeze];
      const results = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          runWithTenantScope(i % 2 ? tenantB : tenantA, freezeIds),
        ),
      );
      results.forEach((seen, i) => expect(seen).toEqual(expected(i)));
      expect(await freezeIds()).toEqual([ids.sharedFreeze]);
    });
  });

  describe('commercial-account records', () => {
    it('are visible to a tenant bound to the account, and to no other', async () => {
      expect(
        await runWithTenantScope(tenantA, () =>
          prisma.commercialInvoice.count({ where: { id: ids.invoice } }),
        ),
      ).toBe(1);
      expect(
        await runWithTenantScope(tenantB, () =>
          prisma.commercialInvoice.count({ where: { id: ids.invoice } }),
        ),
      ).toBe(0);
    });

    it('follow their parent: a dunning case is visible exactly when its contract is', async () => {
      expect(
        await runWithTenantScope(tenantA, () =>
          prisma.dunningCase.count({ where: { id: ids.dunningCase } }),
        ),
      ).toBe(1);
      expect(
        await runWithTenantScope(tenantB, () =>
          prisma.dunningCase.count({ where: { id: ids.dunningCase } }),
        ),
      ).toBe(0);
    });

    it('stop being visible once the binding has ended', async () => {
      await owner.query(
        `UPDATE commercial."CommercialAccountTenantBinding" SET status = 'ENDED' WHERE id = $1`,
        [ids.binding],
      );
      try {
        expect(
          await runWithTenantScope(tenantA, () =>
            prisma.commercialInvoice.count({ where: { id: ids.invoice } }),
          ),
        ).toBe(0);
        expect(
          await runWithTenantScope(tenantA, () =>
            prisma.dunningCase.count({ where: { id: ids.dunningCase } }),
          ),
        ).toBe(0);
      } finally {
        await owner.query(
          `UPDATE commercial."CommercialAccountTenantBinding" SET status = 'ACTIVE' WHERE id = $1`,
          [ids.binding],
        );
      }
    });
  });

  describe('platform scope', () => {
    it('sees every tenant for a declared platform operation', async () => {
      expect(await runWithPlatformScope('rls test', freezeIds)).toEqual([
        ids.freezeA,
        ids.freezeB,
        ids.sharedFreeze,
      ]);
    });

    it('is refused to a role without shield_platform_scope, whatever the session claims', async () => {
      const outsider = new Client({
        connectionString: loginUrl(ROLES.outsider),
      });
      await outsider.connect();
      try {
        await outsider.query(
          `SELECT set_config('app.platform_scope', 'on', false)`,
        );
        const { rows } = await outsider.query(
          `SELECT id FROM response_proposal."Freeze" WHERE id LIKE $1 ORDER BY id`,
          [`${run}%`],
        );
        expect(rows.map((r) => r.id)).toEqual([ids.sharedFreeze]);
      } finally {
        await outsider.end();
      }
    });
  });

  describe('service roles', () => {
    it("deny a satellite service another module's schema", async () => {
      const ai = new Client({ connectionString: loginUrl(ROLES.ai) });
      await ai.connect();
      try {
        await expect(
          ai.query(`SELECT 1 FROM billing."CommercialInvoice" LIMIT 1`),
        ).rejects.toThrow(/permission denied/);
        await expect(
          ai.query(`SELECT 1 FROM ai."AiOutput" LIMIT 1`),
        ).resolves.toBeDefined();
      } finally {
        await ai.end();
      }
    });

    it('never grant TRUNCATE, which row-level security does not filter', async () => {
      const { rows } = await owner.query(
        `SELECT table_schema, table_name, grantee FROM information_schema.role_table_grants
          WHERE privilege_type = 'TRUNCATE' AND grantee LIKE 'shield\\_%\\_app'`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('catalogue', () => {
    it('enables and forces row-level security on every tenant-isolated table, and only those', async () => {
      const { rows } = await owner.query(
        `SELECT n.nspname || '.' || c.relname AS key, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
                (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname LIKE 'shield\\_%')::int AS policies
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
            AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'shield_rls')
            AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname NOT LIKE 'scratch\\_%'`,
      );
      const wrong = rows.filter((row) => {
        const kind = policy.TABLES[row.key]?.kind ?? 'tenant';
        const exempt = kind === 'global' || kind === 'control_plane';
        return exempt
          ? row.enabled || row.forced || row.policies > 0
          : !row.enabled || !row.forced || row.policies === 0;
      });
      expect(rows.length).toBeGreaterThan(250);
      expect(wrong).toEqual([]);
    });

    it('lets offboarding discover tenant tables in every module schema', async () => {
      const tables = await runWithPlatformScope('rls test discovery', () =>
        discoverTenantKeyedTables(prisma),
      );
      const qualified = tables.map((t) => t.qualified);
      expect(qualified).toEqual(
        expect.arrayContaining([
          'cpq."CommercialQuoteLine"',
          'case_management."Case"',
          'ingest."RawEvent"',
        ]),
      );
      expect(new Set(tables.map((t) => t.schema)).size).toBeGreaterThan(35);
    });
  });
});
