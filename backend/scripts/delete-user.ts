import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantScopedPool } from '../libs/database/src';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: npx ts-node delete-user.ts <email>');
    process.exit(1);
  }

  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://shield:shield@localhost:5433/shield_core';

  // Operator tool: removes the principal's memberships in every tenant.
  const pool = new TenantScopedPool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Find user
  const principal = await prisma.principal.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!principal) {
    console.log(`User with email ${email} not found.`);
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  const principalId = principal.id;
  console.log(`Found user: ${principalId}. Deleting dependencies...`);

  // Delete credentials, memberships (their user_roles rows cascade) and
  // sessions, then the principal, as one unit.
  await prisma.$transaction([
    prisma.localCredential.deleteMany({ where: { principalId } }),
    prisma.tenantMembership.deleteMany({ where: { principalId } }),
    prisma.session.deleteMany({ where: { principalId } }),
    prisma.principal.delete({ where: { id: principalId } }),
  ]);

  console.log(`Successfully deleted user ${email}`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
