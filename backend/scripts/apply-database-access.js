require('dotenv/config');
const { createHash } = require('crypto');
const { readFileSync } = require('fs');
const { join } = require('path');
const { Client } = require('pg');
const policy = require('../prisma/access/access-policy');

/**
 * Applies prisma/access/access-policy.js: service roles, schema and table
 * grants, and tenant row-level security on every managed table.
 *
 * Runs after `prisma migrate deploy`, as the schema-owner role, in one
 * transaction: a failure leaves the previous access state untouched. Re-running
 * it is harmless. It refuses to commit while any table is unclassified or any
 * policy entry names a table that no longer exists.
 *
 * Session contract the policies read (set per connection by the services'
 * TenantScopedPool, never by request input):
 *   app.tenant_id       the tenant this unit of work acts for, or ''
 *   app.platform_scope  'on' for an explicitly declared platform-wide operation
 *   app.scope_reason    why platform scope was entered (for audit logs)
 * Platform scope also requires membership in shield_platform_scope, so the
 * bypass is a database grant as well as an application declaration.
 */

const PLATFORM_SCOPE_ROLE = 'shield_platform_scope';
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const ident = (name) => {
  if (!IDENTIFIER.test(name)) throw new Error(`Unsafe identifier '${name}'`);
  return `"${name}"`;
};
const qualified = (key) => {
  const [schema, table] = splitKey(key);
  return `${ident(schema)}.${ident(table)}`;
};
const splitKey = (key) => {
  const parts = key.split('.');
  if (parts.length !== 2)
    throw new Error(`Table key '${key}' must be "schema.table"`);
  return parts;
};
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;

function managedSchemas() {
  const datasource = readFileSync(
    join(__dirname, '..', 'prisma', 'schema.prisma'),
    'utf8',
  );
  const match = /schemas\s*=\s*\[([^\]]*)\]/.exec(datasource);
  if (!match)
    throw new Error('prisma/schema.prisma declares no datasource schemas');
  return [...match[1].matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((schema) => !policy.UNMANAGED_SCHEMAS.includes(schema));
}

const FUNCTIONS = `
CREATE SCHEMA IF NOT EXISTS shield_rls;
REVOKE ALL ON SCHEMA shield_rls FROM PUBLIC;

CREATE OR REPLACE FUNCTION shield_rls.tenant_id() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '') $$;

-- The identity, authorization and tenant schemas key rows by a uuid "tenantId".
-- A tenant id that is not a uuid matches none of them rather than raising.
CREATE OR REPLACE FUNCTION shield_rls.tenant_uuid() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN shield_rls.tenant_id() ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN shield_rls.tenant_id()::uuid END $$;

CREATE OR REPLACE FUNCTION shield_rls.is_platform() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT COALESCE(current_setting('app.platform_scope', true), '') = 'on'
               AND pg_has_role(current_user, '${PLATFORM_SCOPE_ROLE}', 'MEMBER') $$;

CREATE OR REPLACE FUNCTION shield_rls.account_visible(account_id text) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT account_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM commercial."CommercialAccountTenantBinding" binding_row
           WHERE binding_row.commercial_account_id = account_id
             AND binding_row.tenant_id = shield_rls.tenant_id()
             AND binding_row.status IN (${policy.VISIBLE_BINDING_STATES.map(literal).join(', ')})) $$;

CREATE TABLE IF NOT EXISTS shield_rls.access_policy_applications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user,
  policy_sha256 text NOT NULL,
  summary jsonb NOT NULL
);
`;

/** Build the read and write expressions for one table. */
function expressions(key, entry, columns) {
  const [, table] = splitKey(key);
  const self = ident(table);
  const P = 'shield_rls.is_platform()';
  const col = (name) => {
    if (!columns.has(name))
      throw new Error(`${key}: policy names missing column '${name}'`);
    return ident(name);
  };
  const tenantMatch = () => {
    const name = columns.has('tenant_id')
      ? 'tenant_id'
      : columns.has('tenantId')
        ? 'tenantId'
        : null;
    if (!name)
      throw new Error(
        `${key}: kind '${entry.kind}' needs a tenant_id or "tenantId" column`,
      );
    const fn =
      columns.get(name).type === 'uuid'
        ? 'shield_rls.tenant_uuid()'
        : 'shield_rls.tenant_id()';
    return { column: ident(name), match: `${ident(name)} = ${fn}` };
  };
  const parentVisible = () => {
    const [parentSchema, parentTable] = splitKey(entry.parent);
    return `EXISTS (SELECT 1 FROM ${ident(parentSchema)}.${ident(parentTable)} parent_row WHERE parent_row."id" = ${self}.${col(entry.fk)})`;
  };
  switch (entry.kind) {
    case 'tenant': {
      const t = tenantMatch();
      return { read: `${t.match} OR ${P}` };
    }
    case 'tenant_or_shared': {
      const t = tenantMatch();
      return {
        read: `${t.match} OR ${t.column} IS NULL OR ${P}`,
        write: `${t.match} OR ${P}`,
      };
    }
    case 'tenant_or_account': {
      const t = tenantMatch();
      return {
        read: `${t.match} OR (${t.column} IS NULL AND shield_rls.account_visible(${col(entry.column || 'commercial_account_id')})) OR ${P}`,
      };
    }
    case 'tenant_or_parent': {
      const t = tenantMatch();
      return {
        read: `${t.match} OR (${t.column} IS NULL AND ${parentVisible()}) OR ${P}`,
      };
    }
    case 'account':
      return {
        read: `shield_rls.account_visible(${col(entry.column || 'commercial_account_id')}) OR ${P}`,
      };
    case 'account_or_shared': {
      const account = col(entry.column || 'commercial_account_id');
      return {
        read: `${account} IS NULL OR shield_rls.account_visible(${account}) OR ${P}`,
        write: `shield_rls.account_visible(${account}) OR ${P}`,
      };
    }
    case 'parent':
      return { read: `${parentVisible()} OR ${P}` };
    case 'tenant_pair':
      return {
        read: `${entry.columns.map((c) => `${col(c)} = shield_rls.tenant_id()`).join(' OR ')} OR ${P}`,
      };
    case 'group_account':
      return {
        read: `EXISTS (SELECT 1 FROM commercial."CommercialAccount" member_account WHERE member_account.group_account_id = ${self}."id") OR ${P}`,
      };
    default:
      throw new Error(`${key}: unknown isolation kind '${entry.kind}'`);
  }
}

function policyStatements(key, entry, columns) {
  const target = qualified(key);
  const { read, write } = expressions(key, entry, columns);
  const statements = [
    `ALTER TABLE ${target} ENABLE ROW LEVEL SECURITY`,
    // FORCE: the table owner (the migration role) is filtered too.
    `ALTER TABLE ${target} FORCE ROW LEVEL SECURITY`,
  ];
  if (!write || write === read) {
    statements.push(
      `CREATE POLICY shield_tenant_isolation ON ${target} FOR ALL USING (${read}) WITH CHECK (${read})`,
    );
  } else {
    // Shared rows are readable by every tenant, but a combined policy would
    // also let any tenant UPDATE or DELETE them. Reads and writes are split.
    statements.push(
      `CREATE POLICY shield_tenant_read ON ${target} FOR SELECT USING (${read})`,
      `CREATE POLICY shield_tenant_insert ON ${target} FOR INSERT WITH CHECK (${write})`,
      `CREATE POLICY shield_tenant_update ON ${target} FOR UPDATE USING (${write}) WITH CHECK (${write})`,
      `CREATE POLICY shield_tenant_delete ON ${target} FOR DELETE USING (${write})`,
    );
  }
  return statements;
}

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
  const schemas = managedSchemas();
  const roles = Object.keys(policy.SERVICE_ROLES);
  const policySha = createHash('sha256')
    .update(
      readFileSync(
        join(__dirname, '..', 'prisma', 'access', 'access-policy.js'),
      ),
    )
    .digest('hex');

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'shield-database-access',
    ]);

    for (const role of [...roles, PLATFORM_SCOPE_ROLE]) {
      await client.query(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(role)}) THEN CREATE ROLE ${ident(role)} NOLOGIN; END IF; END $$`,
      );
    }
    await client.query(FUNCTIONS);
    // FORCE row-level security filters the owner too. Data migrations declare
    // platform scope (SELECT set_config('app.platform_scope', 'on', ...)), which
    // only takes effect for a member of shield_platform_scope.
    await client.query(`GRANT ${ident(PLATFORM_SCOPE_ROLE)} TO CURRENT_USER`);

    // ---- Catalogue of managed tables and their columns.
    const { rows } = await client.query(
      `SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
              format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition AND n.nspname = ANY($1)`,
      [schemas],
    );
    const tables = new Map();
    for (const row of rows) {
      const key = `${row.schema}.${row.table}`;
      if (!tables.has(key)) tables.set(key, new Map());
      tables
        .get(key)
        .set(row.column, { type: row.type, notNull: row.not_null });
    }

    // ---- Classify every table; stop on anything undecided.
    const stale = Object.keys(policy.TABLES).filter((key) => !tables.has(key));
    if (stale.length)
      throw new Error(
        `Access policy names tables that do not exist: ${stale.join(', ')}`,
      );
    const classified = new Map();
    const unclassified = [];
    for (const [key, columns] of tables) {
      const explicit = policy.TABLES[key];
      if (explicit) classified.set(key, explicit);
      else if (
        columns.get('tenant_id')?.notNull ||
        columns.get('tenantId')?.notNull
      )
        classified.set(key, { kind: 'tenant' });
      else unclassified.push(key);
    }
    if (unclassified.length) {
      throw new Error(
        `Tables without an isolation decision (add them to prisma/access/access-policy.js): ${unclassified.sort().join(', ')}`,
      );
    }

    // ---- Grants: revoke everything the service roles hold, then grant the policy.
    for (const schema of schemas) {
      const s = ident(schema);
      await client.query(`REVOKE ALL ON SCHEMA ${s} FROM PUBLIC`);
      for (const role of roles) {
        const r = ident(role);
        await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${s} FROM ${r}`);
        await client.query(
          `REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${s} FROM ${r}`,
        );
        await client.query(`REVOKE ALL ON SCHEMA ${s} FROM ${r}`);
      }
    }
    const grantSchema = async (role, schema, mode) => {
      const s = ident(schema);
      const r = ident(role);
      await client.query(`GRANT USAGE ON SCHEMA ${s} TO ${r}`);
      if (mode === 'readwrite') {
        await client.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${s} TO ${r}`,
        );
        await client.query(
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO ${r}`,
        );
      }
    };
    for (const [role, spec] of Object.entries(policy.SERVICE_ROLES)) {
      const r = ident(role);
      await client.query(`GRANT USAGE ON SCHEMA shield_rls TO ${r}`);
      await client.query(
        `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shield_rls TO ${r}`,
      );
      await client.query(`GRANT ${ident(PLATFORM_SCOPE_ROLE)} TO ${r}`);
      if (spec.allSchemas) {
        for (const schema of schemas)
          await grantSchema(role, schema, 'readwrite');
        continue;
      }
      for (const schema of spec.ownSchemas ?? []) {
        if (!schemas.includes(schema))
          throw new Error(`${role}: unknown own schema '${schema}'`);
        await grantSchema(role, schema, 'readwrite');
      }
      for (const [key, mode] of Object.entries(spec.tables ?? {})) {
        if (!tables.has(key))
          throw new Error(`${role}: grant names missing table '${key}'`);
        await client.query(
          `GRANT USAGE ON SCHEMA ${ident(splitKey(key)[0])} TO ${r}`,
        );
        const privileges =
          mode === 'readwrite' ? 'SELECT, INSERT, UPDATE, DELETE' : 'SELECT';
        await client.query(`GRANT ${privileges} ON ${qualified(key)} TO ${r}`);
      }
    }

    // ---- Row-level security, rebuilt from the policy on every run.
    const counts = {};
    for (const [key, entry] of classified) {
      counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
      const target = qualified(key);
      const existing = await client.query(
        `SELECT polname FROM pg_policy WHERE polrelid = $1::regclass AND polname LIKE 'shield\\_%'`,
        [target],
      );
      for (const { polname } of existing.rows) {
        await client.query(`DROP POLICY ${ident(polname)} ON ${target}`);
      }
      if (entry.kind === 'global' || entry.kind === 'control_plane') {
        await client.query(`ALTER TABLE ${target} NO FORCE ROW LEVEL SECURITY`);
        await client.query(`ALTER TABLE ${target} DISABLE ROW LEVEL SECURITY`);
        continue;
      }
      for (const statement of policyStatements(key, entry, tables.get(key))) {
        await client.query(statement);
      }
    }

    // ---- Login users per environment, e.g.
    // DATABASE_ROLE_MEMBERS={"shield_core_app":["shield-core@project.iam"]}
    const members = process.env.DATABASE_ROLE_MEMBERS
      ? JSON.parse(process.env.DATABASE_ROLE_MEMBERS)
      : {};
    for (const [role, logins] of Object.entries(members)) {
      if (!roles.includes(role))
        throw new Error(`DATABASE_ROLE_MEMBERS names unknown role '${role}'`);
      for (const login of logins) {
        const exists = await client.query(
          'SELECT 1 FROM pg_roles WHERE rolname = $1',
          [login],
        );
        if (!exists.rowCount)
          throw new Error(
            `DATABASE_ROLE_MEMBERS: login role '${login}' does not exist`,
          );
        await client.query(`GRANT ${ident(role)} TO ${ident(login)}`);
      }
    }

    const summary = {
      tables: classified.size,
      kinds: counts,
      roles,
      schemas: schemas.length,
    };
    await client.query(
      'INSERT INTO shield_rls.access_policy_applications (policy_sha256, summary) VALUES ($1, $2)',
      [policySha, JSON.stringify(summary)],
    );
    await client.query('COMMIT');
    console.log(`Database access policy applied: ${JSON.stringify(summary)}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
