/**
 * One-time bootstrap: grants an existing principal the PLATFORM_SUPER_ADMIN
 * role so they can create permissions/roles/invitation-capable roles via the
 * API. There is no other way in — by design, per IAM-04 "no standing
 * universal privilege" nothing in the HTTP API can self-elevate to this.
 *
 * Usage: npm run seed:platform-admin -- <email>
 */
import 'reflect-metadata';
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
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run seed:platform-admin -- <email>');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
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
    synchronize: false,
    ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
  await dataSource.initialize();

  const principalRepo = dataSource.getRepository(Principal);
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);
  const membershipRepo = dataSource.getRepository(TenantMembership);

  const principal = await principalRepo.findOne({ where: { email } });
  if (!principal) {
    console.error(`No principal found with email ${email} — register and verify the account first.`);
    await dataSource.destroy();
    process.exit(1);
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

  console.log(`${email} now holds PLATFORM_SUPER_ADMIN.`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
