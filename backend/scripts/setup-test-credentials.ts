import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantScopedPool } from '../libs/database/src';

async function main() {
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

  try {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const now = new Date();

    // 1. Set password for owner@acme.com (verified)
    const owner = await prisma.principal.findUnique({ where: { email: 'owner@acme.com' } });
    if (owner) {
      await prisma.localCredential.upsert({
        where: { principalId: owner.id },
        create: { principalId: owner.id, passwordHash, passwordUpdatedAt: now },
        update: { passwordHash, passwordUpdatedAt: now, failedAttempts: 0, lockedUntil: null },
      });
      console.log('✔ Password set for verified user owner@acme.com');
    }

    // 2. Set password for testadmin282@gmail.com (keep unverified)
    const unverified = await prisma.principal.findUnique({ where: { email: 'testadmin282@gmail.com' } });
    if (unverified) {
      await prisma.localCredential.upsert({
        where: { principalId: unverified.id },
        create: { principalId: unverified.id, passwordHash, passwordUpdatedAt: now },
        update: { passwordHash, passwordUpdatedAt: now, failedAttempts: 0, lockedUntil: null },
      });
      await prisma.principal.update({
        where: { id: unverified.id },
        data: { emailVerified: false },
      });
      console.log('✔ Password set for unverified user testadmin282@gmail.com (emailVerified: false preserved)');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
