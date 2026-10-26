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
    const principals = await prisma.principal.findMany();
    console.log(`Principals in DB (${principals.length}):`);
    console.table(
      principals.map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.fullName,
        emailVerified: p.emailVerified,
        status: p.status,
      }))
    );

    const tenants = await prisma.tenant.findMany();
    console.log(`Tenants in DB (${tenants.length}):`);
    console.table(
      tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
      }))
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
