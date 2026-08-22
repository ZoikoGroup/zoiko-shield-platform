import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx ts-node set-password.ts <email> <new-password>');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL || 'postgres://shield:shield@localhost:5433/shield_core';

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [], // No entities, using raw SQL
    synchronize: false,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();

  // Find user by email
  const principals = await dataSource.query(`SELECT id FROM identity.principals WHERE email = $1`, [email]);

  if (!principals.length) {
    const allUsers = await dataSource.query(`SELECT email FROM identity.principals WHERE email IS NOT NULL`);
    console.error(`User with email '${email}' not found.`);
    console.log('The following users exist in the database:');
    allUsers.forEach((u: any) => console.log(`- ${u.email}`));
    process.exit(1);
  }

  const principalId = principals[0].id;
  const passwordHash = await bcrypt.hash(password, 10);

  // Check if credential exists
  const creds = await dataSource.query(`SELECT "principalId" FROM identity.local_credentials WHERE "principalId" = $1`, [principalId]);

  if (!creds.length) {
    await dataSource.query(
      `INSERT INTO identity.local_credentials ("principalId", "passwordHash", "passwordUpdatedAt", "failedAttempts", "mustChangePassword") VALUES ($1, $2, $3, 0, false)`,
      [principalId, passwordHash, new Date()]
    );
  } else {
    await dataSource.query(
      `UPDATE identity.local_credentials SET "passwordHash" = $2, "passwordUpdatedAt" = $3, "failedAttempts" = 0, "lockedUntil" = NULL WHERE "principalId" = $1`,
      [principalId, passwordHash, new Date()]
    );
  }

  // Automatically verify the email since we are bypassing the normal email flow
  await dataSource.query(
    `UPDATE identity.principals SET "emailVerified" = true WHERE id = $1`,
    [principalId]
  );

  console.log(`✅ Password successfully set for ${email}. (No roles were modified)`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
