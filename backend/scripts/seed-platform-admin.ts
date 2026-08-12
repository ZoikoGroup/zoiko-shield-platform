/**
 * Bootstrap script: creates or updates a principal with PLATFORM_SUPER_ADMIN
 * role and full platform permissions.
 *
 * Usage: npm run seed:platform-admin -- <email> [password]
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { Principal } from '../apps/shield-core/src/modules/identity-adapter/principal.entity';
import { LocalCredential } from '../apps/shield-core/src/modules/identity-adapter/local-credential.entity';
import { ExternalIdentity } from '../apps/shield-core/src/modules/identity-adapter/external-identity.entity';
import { Session } from '../apps/shield-core/src/modules/identity-adapter/session.entity';
import { VerificationChallenge } from '../apps/shield-core/src/modules/identity-adapter/verification-challenge.entity';
import { RecoveryGrant } from '../apps/shield-core/src/modules/identity-adapter/recovery-grant.entity';
import { PolicyDocument } from '../apps/shield-core/src/modules/identity-adapter/policy-document.entity';
import { PolicyAcceptance } from '../apps/shield-core/src/modules/identity-adapter/policy-acceptance.entity';
import { IdentityEvent } from '../apps/shield-core/src/modules/identity-adapter/identity-event.entity';
import { Permission } from '../apps/shield-core/src/modules/authorization/entities/permission.entity';
import { Role } from '../apps/shield-core/src/modules/authorization/entities/role.entity';
import { TenantMembership } from '../apps/shield-core/src/modules/authorization/entities/tenant-membership.entity';
import { Invitation } from '../apps/shield-core/src/modules/authorization/entities/invitation.entity';
import { PLATFORM_SCOPE, PERMISSION_CODES } from '../apps/shield-core/src/modules/authorization/constants';

async function main() {
  const email = process.argv[2] || 'rvishwajeet001@gmail.com';
  const password = process.argv[3] || 'Th@nksG00gle';

  if (!email) {
    console.error('Usage: npm run seed:platform-admin -- <email> [password]');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL || 'postgres://shield:shield@localhost:5433/shield_core';

  // Ensure schemas exist before TypeORM initializes
  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
  await pgClient.connect();
  await pgClient.query('CREATE SCHEMA IF NOT EXISTS "identity"');
  await pgClient.query('CREATE SCHEMA IF NOT EXISTS "authorization"');
  await pgClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await pgClient.end();

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [
      Principal,
      LocalCredential,
      ExternalIdentity,
      Session,
      VerificationChallenge,
      RecoveryGrant,
      PolicyDocument,
      PolicyAcceptance,
      IdentityEvent,
      Permission,
      Role,
      TenantMembership,
      Invitation,
    ],
    synchronize: true,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();

  const principalRepo = dataSource.getRepository(Principal);
  const localCredRepo = dataSource.getRepository(LocalCredential);
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);
  const membershipRepo = dataSource.getRepository(TenantMembership);

  let principal = await principalRepo.findOne({ where: { email } });

  if (!principal) {
    const passwordHash = await bcrypt.hash(password, 10);
    principal = await principalRepo.save(
      principalRepo.create({
        principalType: 'HUMAN',
        source: 'LOCAL',
        email,
        fullName: 'Super Admin',
        emailVerified: true,
        status: 'ACTIVE',
      }),
    );
    await localCredRepo.save(
      localCredRepo.create({
        principalId: principal.id,
        passwordHash,
        passwordUpdatedAt: new Date(),
      }),
    );
    console.log(`Created new Super Admin principal for ${email}`);
  } else {
    principal.emailVerified = true;
    principal.status = 'ACTIVE';
    await principalRepo.save(principal);

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      let cred = await localCredRepo.findOne({ where: { principalId: principal.id } });
      if (!cred) {
        await localCredRepo.save(
          localCredRepo.create({
            principalId: principal.id,
            passwordHash,
            passwordUpdatedAt: new Date(),
          }),
        );
      } else {
        cred.passwordHash = passwordHash;
        cred.passwordUpdatedAt = new Date();
        cred.failedAttempts = 0;
        cred.lockedUntil = null;
        await localCredRepo.save(cred);
      }
      console.log(`Updated credentials for existing principal ${email}`);
    }
  }

  const codes = Object.values(PERMISSION_CODES);
  const permissions = [];
  for (const code of codes) {
    let permission = await permissionRepo.findOne({ where: { code } });
    if (!permission) {
      permission = await permissionRepo.save(permissionRepo.create({ code }));
      console.log(`Created permission ${code}`);
    }
    permissions.push(permission);
  }

  let role = await roleRepo.findOne({ where: { code: 'PLATFORM_SUPER_ADMIN' }, relations: { permissions: true } });
  if (!role) {
    role = await roleRepo.save(
      roleRepo.create({
        tenantId: null,
        code: 'PLATFORM_SUPER_ADMIN',
        name: 'Platform Super Admin',
        roleLevel: 'PLATFORM',
        permissions,
      }),
    );
    console.log('Created role PLATFORM_SUPER_ADMIN');
  } else {
    role.permissions = permissions;
    await roleRepo.save(role);
  }

  let membership = await membershipRepo.findOne({
    where: { tenantId: PLATFORM_SCOPE, principalId: principal.id },
    relations: { roles: true },
  });
  if (!membership) {
    membership = membershipRepo.create({
      tenantId: PLATFORM_SCOPE,
      principalId: principal.id,
      status: 'ACTIVE',
      source: 'BOOTSTRAP',
      roles: [],
    });
  }
  if (!membership.roles.some((r) => r.id === role.id)) {
    membership.roles.push(role);
  }
  await membershipRepo.save(membership);

  console.log(`SUCCESS: ${email} is now a PLATFORM_SUPER_ADMIN with password set.`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
