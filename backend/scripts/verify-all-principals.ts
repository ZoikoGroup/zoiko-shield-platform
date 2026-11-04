import 'dotenv/config';
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
    const res = await prisma.principal.updateMany({
      where: { emailVerified: false },
      data: { emailVerified: true },
    });
    console.log(`Successfully verified ${res.count} previously unverified principal(s).`);

    const principals = await prisma.principal.findMany();
    console.table(
      principals.map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.fullName,
        emailVerified: p.emailVerified,
        status: p.status,
      }))
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
