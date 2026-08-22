import 'dotenv/config';
import { DataSource } from 'typeorm';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: npx ts-node delete-user.ts <email>');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL || 'postgres://shield:shield@localhost:5433/shield_core';

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    // No entities needed for raw queries
    entities: [],
    synchronize: false,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();

  // Find user
  const principals = await dataSource.query(`SELECT id FROM identity.principals WHERE email = $1`, [email]);
  
  if (!principals.length) {
    console.log(`User with email ${email} not found.`);
    await dataSource.destroy();
    return;
  }

  const principalId = principals[0].id;
  console.log(`Found user: ${principalId}. Deleting dependencies...`);

  // Delete credentials and memberships
  await dataSource.query(`DELETE FROM identity.local_credentials WHERE "principalId" = $1 OR "principal_id" = $1`, [principalId]).catch(() => {});
  await dataSource.query(`DELETE FROM authorization.tenant_memberships WHERE "principalId" = $1 OR "principal_id" = $1`, [principalId]).catch(() => {});
  await dataSource.query(`DELETE FROM identity.sessions WHERE "principalId" = $1 OR "principal_id" = $1`, [principalId]).catch(() => {});

  // Delete the user
  await dataSource.query(`DELETE FROM identity.principals WHERE id = $1`, [principalId]);

  console.log(`Successfully deleted user ${email}`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
