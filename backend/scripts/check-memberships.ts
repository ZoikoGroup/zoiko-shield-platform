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
    const memberships = await prisma.tenantMembership.findMany({
      include: {
        roles: { include: { role: true } },
      },
    });
    const principals = await prisma.principal.findMany();
    const pMap = new Map(principals.map((p) => [p.id, p.email]));

    console.log(`Memberships in DB (${memberships.length}):`);
    console.table(
      memberships.map((m) => ({
        principalId: m.principalId,
        email: pMap.get(m.principalId) || 'unknown',
        tenantId: m.tenantId,
        status: m.status,
        roles: m.roles.map((r) => r.role.code).join(', '),
      }))
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
