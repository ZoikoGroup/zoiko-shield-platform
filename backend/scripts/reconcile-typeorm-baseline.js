require('dotenv/config');
const { execFileSync } = require('child_process');
const { join } = require('path');
const { Client } = require('pg');

/**
 * Runs before `prisma migrate deploy`. The 20 hand-written TypeORM SQL
 * migrations were folded into the Prisma migration BASELINE (ADR-002). A
 * database that already applied them through the retired runner records them
 * in public.infra_schema_migrations; for that database the baseline is marked
 * as applied rather than re-run, because its statements are not re-runnable.
 *
 * - Fresh database (no runner history): nothing to do; deploy runs the baseline.
 * - All 20 recorded with the original checksums: mark the baseline applied.
 * - Anything in between: stop. A partially migrated database needs a person.
 */
const BASELINE =
  '20260925000000_consolidate_typeorm_identity_tenant_authorization';

const RETIRED_MIGRATIONS = [
  [
    '001_identity_authorization_tenant.sql',
    '57821857651843aa82d1a4981e2be5651976f8aa4cbbb47b6367b3385e97fc8d',
  ],
  [
    '002_enterprise_federation.sql',
    '4f7904db9eea71ee0b9638ae3f78f072fef0a82b87cab948d196882c8759856f',
  ],
  [
    '003_authorization_boundaries.sql',
    'f23c589f3b2341c5953d7e83922c4666f824922b20664b2bde3cf876e5dacbcb',
  ],
  [
    '004_commercial_account_boundaries.sql',
    '718aed28a0ea4ab0ae5ea59e2b9f4c36b6eeb6ae6ff4eddea0a37da5b9f7b3c5',
  ],
  [
    '005_commercial_customer_roles.sql',
    '9c630b484713208960f04c3d595004745429395050c381b9ee7d63c21d890601',
  ],
  [
    '006_group_delegation_corporate_transfer.sql',
    '76d7f2509458f3262048417c79abb26eb6c65ad2eede0c5be3328a6a964c4492',
  ],
  [
    '007_category_a_partner_operation_write.sql',
    'e4a32e2013cd6420b221c8b6b80aa4cecdfcab818830755df74baf5aaf3de2e3',
  ],
  [
    '008_category_b_catalog_pricing_authority.sql',
    'a476dd5ee415309e5554a93ec7604290523379ec5ae4582f745980d90535e0c2',
  ],
  [
    '009_category_b_change_readiness_concessions.sql',
    '30d14c3eec3aa6785f16e5f31194cb35f4b43eb8ef834620a2f8bdace55cb5fd',
  ],
  [
    '010_category_f_assurance_content_permissions.sql',
    '96b87e2f7ba73ed7be8a4faa0d7be7fcb5c74eb23059956d2d06219108ccaab0',
  ],
  [
    '011_category_g_ir_legal_sensitive_permissions.sql',
    '217be27943fd74069a23d6d0b2b2242059dd66f86b22add83304e302a322ec8a',
  ],
  [
    '012_category_g_professional_service_permissions.sql',
    'daab12d75b2b650e002c8b061e5643506d5ebe29c7a67a5635046175687ff76b',
  ],
  [
    '013_category_h_ai_governance_permissions.sql',
    '7e3a79b52b9d3409976b0d2ce32f8496fff65b4a87e77bdc30b90a488b58dea0',
  ],
  [
    '014_category_i_roadmap_permissions.sql',
    '2eb73629594b73ccaa12825aca600b926813e31248421a63a33069fba36f8c6d',
  ],
  [
    '015_category_i_discount_margin_authority.sql',
    '8c632cf00ec395bafb36bdc82ee8fc120b735d530d3d8287d58e600d73c08531',
  ],
  [
    '016_privacy_legal_permissions.sql',
    '40609a98572ca485f6cdd77d1daff686a62c3bac159e33e5486cf89cfdf351ac',
  ],
  [
    '017_privacy_requester_permissions.sql',
    '837f47522cecdcfc1eb23fad36b37b05e911fcac129213dc842d0b3f6b1dd873',
  ],
  [
    '018_owner_activation.sql',
    'ce017e3458dd217ae1c1563e8b3d127fa11eda6728e6b00b64b214d10bdad5a0',
  ],
  [
    '019_webauthn_passkeys.sql',
    '63fa7c3b3a1aee6fa7847a0738fe45836df18969e33872507a34b08a3797ac92',
  ],
  [
    '020_membership_elevation_and_jit_requests.sql',
    '9447e411b9b3a8d999f11611e4e36ce1e502b87085127f92902bcf0139509d0d',
  ],
];

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url)
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
  const client = new Client({
    connectionString: url,
    ssl: url.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();
  let markApplied = false;
  try {
    const history = await client.query(
      "SELECT to_regclass('public.infra_schema_migrations') AS runner, to_regclass('public._prisma_migrations') AS prisma",
    );
    if (!history.rows[0].runner) return;
    if (history.rows[0].prisma) {
      const done = await client.query(
        'SELECT 1 FROM public._prisma_migrations WHERE migration_name = $1',
        [BASELINE],
      );
      if (done.rowCount) return;
    }
    const applied = new Map(
      (
        await client.query(
          'SELECT name, checksum FROM public.infra_schema_migrations',
        )
      ).rows.map((row) => [row.name, row.checksum]),
    );
    const problems = RETIRED_MIGRATIONS.filter(
      ([name, checksum]) => applied.get(name) !== checksum,
    ).map(([name]) => name);
    if (problems.length) {
      throw new Error(
        `The retired TypeORM runner applied only part of the baseline, or a file changed after it ran: ${problems.join(', ')}. ` +
          'Bring the database to the full 020 state, or rebuild it, before deploying.',
      );
    }
    markApplied = true;
  } finally {
    await client.end();
  }
  if (markApplied) {
    execFileSync(
      join(__dirname, '..', 'node_modules', '.bin', 'prisma'),
      ['migrate', 'resolve', '--applied', BASELINE],
      {
        stdio: 'inherit',
        cwd: join(__dirname, '..'),
      },
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
