import 'dotenv/config';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Neon PostgreSQL cloud database.');

  const passwordHash = await bcrypt.hash('Shield@SecOps2026!', 10);
  console.log('Generated bcrypt hash for Shield@SecOps2026!');

  // 1. Ensure Tenants Exist
  const tenantsToEnsure = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Acme Financial Services Inc.',
      slug: 'acme-financial',
    },
    {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'ZoikoShield Global Platform Admin',
      slug: 'platform-admin',
    },
    {
      id: 'e62ef6c1-b027-41ac-85b1-8c161b251fb8',
      name: 'Acme Corporation',
      slug: 'acme-corp',
    },
  ];

  const systemPrincipalId = 'd9f1a558-d601-419a-8c59-7c6867967b01';

  for (const t of tenantsToEnsure) {
    const existing = await client.query('SELECT id FROM "tenant"."tenants" WHERE id = $1', [t.id]);
    if (existing.rows.length === 0) {
      await client.query(`
        INSERT INTO "tenant"."tenants" 
        (id, name, slug, status, "homeRegion", "dataResidencyRegion", timezone, "createdByPrincipalId", "createdAt", "updatedAt", "dataClass", "retentionPolicyRef")
        VALUES ($1, $2, $3, 'ACTIVE', 'us-east-1', 'us-east-1', 'UTC', $4, NOW(), NOW(), 'RESTRICTED', 'standard-7yr')
      `, [t.id, t.name, t.slug, systemPrincipalId]);
      console.log(`✔ Created Tenant: ${t.name} (${t.id})`);
    } else {
      console.log(`ℹ Tenant already exists: ${t.name} (${t.id})`);
    }
  }

  // 2. Ensure Demo Principals Exist
  const demoUsers = [
    { email: 'sarah.chen@acme.com', fullName: 'Sarah Chen' },
    { email: 'analyst@zoikoshield-demo.com', fullName: 'Lead Security Analyst' },
    { email: 'owner@acme.com', fullName: 'Acme Owner' },
    { email: 'admin@zoikoshield.io', fullName: 'Platform Super Admin' },
  ];

  const tenantOwnerRoleId = '69abe8d2-fc60-4f9e-a606-85fcb203d08d';

  for (const u of demoUsers) {
    let principalId: string;
    const existingUser = await client.query('SELECT id FROM "identity"."principals" WHERE email = $1', [u.email]);
    if (existingUser.rows.length === 0) {
      principalId = randomUUID();
      await client.query(`
        INSERT INTO "identity"."principals"
        (id, "principalType", status, source, "riskState", email, "fullName", "emailVerified", "createdAt", "updatedAt")
        VALUES ($1, 'HUMAN', 'ACTIVE', 'LOCAL', 'LOW', $2, $3, true, NOW(), NOW())
      `, [principalId, u.email, u.fullName]);
      console.log(`✔ Created Principal: ${u.email} (${principalId})`);
    } else {
      principalId = existingUser.rows[0].id;
      console.log(`ℹ Principal already exists: ${u.email} (${principalId})`);
    }

    // Set or Update Local Credentials
    const existingCred = await client.query('SELECT id FROM "identity"."local_credentials" WHERE "principalId" = $1', [principalId]);
    if (existingCred.rows.length === 0) {
      await client.query(`
        INSERT INTO "identity"."local_credentials"
        (id, "principalId", "passwordHash", "passwordUpdatedAt", "failedAttempts", "lockedUntil", "mustChangePassword", "createdAt")
        VALUES ($1, $2, $3, NOW(), 0, NULL, false, NOW())
      `, [randomUUID(), principalId, passwordHash]);
      console.log(`✔ Created Password for: ${u.email}`);
    } else {
      await client.query(`
        UPDATE "identity"."local_credentials"
        SET "passwordHash" = $1, "failedAttempts" = 0, "lockedUntil" = NULL, "mustChangePassword" = false, "passwordUpdatedAt" = NOW()
        WHERE "principalId" = $2
      `, [passwordHash, principalId]);
      console.log(`✔ Updated Password for: ${u.email}`);
    }

    // Add Tenant Memberships to all 3 tenants
    for (const t of tenantsToEnsure) {
      const existingMem = await client.query(`
        SELECT id FROM "authorization"."tenant_memberships" 
        WHERE "principalId" = $1 AND "tenantId" = $2
      `, [principalId, t.id]);

      let membershipId: string;
      if (existingMem.rows.length === 0) {
        membershipId = randomUUID();
        await client.query(`
          INSERT INTO "authorization"."tenant_memberships"
          (id, "tenantId", "principalId", status, source, "joinedAt")
          VALUES ($1, $2, $3, 'ACTIVE', 'BOOTSTRAP', NOW())
        `, [membershipId, t.id, principalId]);
        console.log(`✔ Added Membership for ${u.email} in Tenant ${t.id}`);
      } else {
        membershipId = existingMem.rows[0].id;
      }

      // Assign Tenant Owner Role
      const existingRole = await client.query(`
        SELECT 1 FROM "authorization"."user_roles"
        WHERE membership_id = $1 AND role_id = $2
      `, [membershipId, tenantOwnerRoleId]);

      if (existingRole.rows.length === 0) {
        await client.query(`
          INSERT INTO "authorization"."user_roles" (membership_id, role_id)
          VALUES ($1, $2)
        `, [membershipId, tenantOwnerRoleId]);
      }
    }
  }

  // Also update user@example.com password to Shield@SecOps2026! or keep MyPassword123
  console.log('\n🎉 ALL DEMO USERS SEEDED IN NEON CLOUD DATABASE SUCCESSFULLY!');
  await client.end();
}

main().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
