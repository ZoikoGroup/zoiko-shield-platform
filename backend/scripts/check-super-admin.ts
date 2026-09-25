import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantScopedPool } from '../libs/database/src';

async function main() {
  const email = process.argv[2] || 'user@example.com';
  const testPassword = process.argv[3] || 'MyPassword123';

  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://shield:shield@localhost:5433/shield_core';

  // Operator tool: reads one principal's memberships across every tenant.
  const pool = new TenantScopedPool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const principal = await prisma.principal.findUnique({ where: { email } });

  if (!principal) {
    console.log(`❌ No principal found with email "${email}"`);
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  console.log(`\n========================================`);
  console.log(`👤 Principal Details for ${email}:`);
  console.log(`========================================`);
  console.log(`ID:            ${principal.id}`);
  console.log(`Full Name:     ${principal.fullName ?? 'N/A'}`);
  console.log(`Type:          ${principal.principalType}`);
  console.log(`Status:        ${principal.status}`);
  console.log(`EmailVerified: ${principal.emailVerified}`);
  console.log(`Created At:    ${principal.createdAt}`);

  const cred = await prisma.localCredential.findUnique({
    where: { principalId: principal.id },
  });
  if (cred) {
    console.log(`\n🔐 Local Credentials:`);
    console.log(`Failed Attempts: ${cred.failedAttempts}`);
    console.log(
      `Locked Until:    ${cred.lockedUntil ? cred.lockedUntil : 'Not locked'}`,
    );
    if (testPassword) {
      const match = await bcrypt.compare(testPassword, cred.passwordHash);
      console.log(
        `Password Match ("${testPassword}"): ${match ? '✅ MATCHES' : '❌ DOES NOT MATCH'}`,
      );
    }
  } else {
    console.log(`\n🔐 Local Credentials: NONE (Federated / SSO only)`);
  }

  const memberships = await prisma.tenantMembership.findMany({
    where: { principalId: principal.id },
    include: {
      roles: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });

  console.log(`\n🛡️  Tenant Memberships & Roles (${memberships.length}):`);
  for (const m of memberships) {
    console.log(` - Tenant ID: ${m.tenantId}`);
    console.log(`   Membership Status: ${m.status}`);
    for (const { role: r } of m.roles) {
      console.log(`   Role: ${r.code} (${r.name})`);
      const permCodes = r.permissions.map((rp) => rp.permission.code);
      console.log(`   Permissions (${permCodes.length}):`, permCodes);
    }
  }
  console.log(`========================================\n`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
