require('dotenv/config');
const { Client } = require('pg');

/**
 * LOCAL DEVELOPMENT ONLY. Creates one non-superuser login per service, so
 * docker-compose runs each service as its own database role.
 *
 * The superuser the postgres image starts with bypasses row-level security
 * entirely; a service connected as it would never exercise tenant isolation.
 * These logins get their privileges from the service group roles, granted by
 * scripts/apply-database-access.js through DATABASE_ROLE_MEMBERS.
 *
 * Cloud SQL environments create their login users in OpenTofu (IAM database
 * users) and never run this script.
 */
const LOGINS = [
  'shield_core_svc',
  'shield_ingest_svc',
  'shield_ai_svc',
  'shield_action_svc',
  'shield_anchor_svc',
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'create-local-service-logins is for local development only',
    );
  }
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url)
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
  const password = process.env.SERVICE_DB_PASSWORD ?? 'shield';
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const login of LOGINS) {
      const exists = await client.query(
        'SELECT 1 FROM pg_roles WHERE rolname = $1',
        [login],
      );
      const verb = exists.rowCount ? 'ALTER' : 'CREATE';
      // NOSUPERUSER NOBYPASSRLS: row-level security must apply to services.
      await client.query(
        `${verb} ROLE "${login}" LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password.replace(/'/g, "''")}'`,
      );
    }
    console.log(`Local service logins ready: ${LOGINS.join(', ')}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
