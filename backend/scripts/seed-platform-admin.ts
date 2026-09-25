import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  PLATFORM_SCOPE,
  PERMISSION_CODES,
} from '../apps/shield-core/src/modules/authorization/constants';
import { TenantScopedPool } from '../libs/database/src';

async function main() {
  const email = process.argv[2] || 'user@example.com';
  const password = process.argv[3] || 'MyPassword123';

  if (!email) {
    console.error('Usage: npm run seed:platform-admin -- <email> [password]');
    process.exit(1);
  }

  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgres://shield:shield@localhost:5433/shield_core';

  // Built the same way as the app's PrismaService. This is an operator tool
  // that acts across tenants (it writes the PLATFORM_SCOPE membership). It
  // never creates or alters schema: identity and authorization tables come
  // only from prisma/migrations, never as a side effect of seeding.
  const pool = new TenantScopedPool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : false,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const [{ present }] = await prisma.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('"authorization".tenant_memberships') IS NOT NULL AS present`;
  if (!present) {
    throw new Error(
      'The identity/authorization tables do not exist. Run `npm run migrate:deploy` before seeding — this script does not create them as a side effect.',
    );
  }

  let principal = await prisma.principal.findUnique({ where: { email } });

  if (!principal) {
    const passwordHash = await bcrypt.hash(password, 10);
    principal = await prisma.principal.create({
      data: {
        principalType: 'HUMAN',
        source: 'LOCAL',
        email,
        fullName: 'Super Admin',
        emailVerified: true,
        status: 'ACTIVE',
      },
    });
    await prisma.localCredential.create({
      data: {
        principalId: principal.id,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });
    console.log(`Created new Super Admin principal for ${email}`);
  } else {
    principal = await prisma.principal.update({
      where: { id: principal.id },
      data: { emailVerified: true, status: 'ACTIVE' },
    });

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      const cred = await prisma.localCredential.findUnique({
        where: { principalId: principal.id },
      });
      if (!cred) {
        await prisma.localCredential.create({
          data: {
            principalId: principal.id,
            passwordHash,
            passwordUpdatedAt: new Date(),
          },
        });
      } else {
        await prisma.localCredential.update({
          where: { id: cred.id },
          data: {
            passwordHash,
            passwordUpdatedAt: new Date(),
            failedAttempts: 0,
            lockedUntil: null,
          },
        });
      }
      console.log(`Updated credentials for existing principal ${email}`);
    }
  }

  const codes = Object.values(PERMISSION_CODES);
  const permissions = [];
  for (const code of codes) {
    let permission = await prisma.permission.findUnique({ where: { code } });
    if (!permission) {
      permission = await prisma.permission.create({ data: { code } });
      console.log(`Created permission ${code}`);
    }
    permissions.push(permission);
  }
  const permissionIds = permissions.map((p) => p.id);

  let role = await prisma.role.findFirst({
    where: { code: 'PLATFORM_SUPER_ADMIN' },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        tenantId: null,
        code: 'PLATFORM_SUPER_ADMIN',
        name: 'Platform Super Admin',
        roleLevel: 'PLATFORM',
        permissions: {
          create: permissionIds.map((permission_id) => ({ permission_id })),
        },
      },
    });
    console.log('Created role PLATFORM_SUPER_ADMIN');
  } else {
    // The role's permission set becomes exactly the current PERMISSION_CODES:
    // grants no longer in the catalogue are dropped, missing ones are added.
    const roleId = role.id;
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { role_id: roleId, permission_id: { notIn: permissionIds } },
      }),
      prisma.rolePermission.createMany({
        data: permissionIds.map((permission_id) => ({
          role_id: roleId,
          permission_id,
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  let membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_principalId: {
        tenantId: PLATFORM_SCOPE,
        principalId: principal.id,
      },
    },
  });
  if (!membership) {
    membership = await prisma.tenantMembership.create({
      data: {
        tenantId: PLATFORM_SCOPE,
        principalId: principal.id,
        status: 'ACTIVE',
        source: 'BOOTSTRAP',
      },
    });
  }
  await prisma.userRole.createMany({
    data: [{ membership_id: membership.id, role_id: role.id }],
    skipDuplicates: true,
  });

  console.log(
    `SUCCESS: ${email} is now a PLATFORM_SUPER_ADMIN with password set.`,
  );
  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
