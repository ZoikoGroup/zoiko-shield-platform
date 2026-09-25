import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantScopedPool } from '../libs/database/src';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: npx ts-node set-password.ts <email> <new-password>');
    process.exit(1);
  }

  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://shield:shield@localhost:5433/shield_core';

  const pool = new TenantScopedPool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Find user by email
  const principal = await prisma.principal.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!principal) {
    const allUsers = await prisma.principal.findMany({
      where: { email: { not: null } },
      select: { email: true },
    });
    console.error(`User with email '${email}' not found.`);
    console.log('The following users exist in the database:');
    allUsers.forEach((u) => console.log(`- ${u.email}`));
    process.exit(1);
  }

  const principalId = principal.id;
  const passwordHash = await bcrypt.hash(password, 10);

  // Create the credential, or reset it: new hash, no failed attempts, unlocked.
  const now = new Date();
  await prisma.localCredential.upsert({
    where: { principalId },
    create: {
      principalId,
      passwordHash,
      passwordUpdatedAt: now,
      failedAttempts: 0,
      mustChangePassword: false,
    },
    update: {
      passwordHash,
      passwordUpdatedAt: now,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  // Automatically verify the email since we are bypassing the normal email flow
  await prisma.principal.update({
    where: { id: principalId },
    data: { emailVerified: true },
  });

  console.log(
    `✅ Password successfully set for ${email}. (No roles were modified)`,
  );
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
