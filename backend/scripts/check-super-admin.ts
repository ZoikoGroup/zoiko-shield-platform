/**
 * Check script: inspects a principal's status, roles, permissions, and credential status in the database.
 *
 * Usage: npm run check:platform-admin -- [email] [password]
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
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

async function main() {
  const email = process.argv[2] || 'rvishwajeet001@gmail.com';
  const testPassword = process.argv[3] || 'Th@nksG00gle';

  const databaseUrl = process.env.DATABASE_URL || 'postgres://shield:shield@localhost:5433/shield_core';

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
    synchronize: false,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();

  const principalRepo = dataSource.getRepository(Principal);
  const localCredRepo = dataSource.getRepository(LocalCredential);
  const membershipRepo = dataSource.getRepository(TenantMembership);

  const principal = await principalRepo.findOne({ where: { email } });

  if (!principal) {
    console.log(`❌ No principal found with email "${email}"`);
    await dataSource.destroy();
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

  const cred = await localCredRepo.findOne({ where: { principalId: principal.id } });
  if (cred) {
    console.log(`\n🔐 Local Credentials:`);
    console.log(`Failed Attempts: ${cred.failedAttempts}`);
    console.log(`Locked Until:    ${cred.lockedUntil ? cred.lockedUntil : 'Not locked'}`);
    if (testPassword) {
      const match = await bcrypt.compare(testPassword, cred.passwordHash);
      console.log(`Password Match ("${testPassword}"): ${match ? '✅ MATCHES' : '❌ DOES NOT MATCH'}`);
    }
  } else {
    console.log(`\n🔐 Local Credentials: NONE (Federated / SSO only)`);
  }

  const memberships = await membershipRepo.find({
    where: { principalId: principal.id },
    relations: { roles: { permissions: true } },
  });

  console.log(`\n🛡️  Tenant Memberships & Roles (${memberships.length}):`);
  for (const m of memberships) {
    console.log(` - Tenant ID: ${m.tenantId}`);
    console.log(`   Membership Status: ${m.status}`);
    for (const r of m.roles) {
      console.log(`   Role: ${r.code} (${r.name})`);
      const permCodes = r.permissions?.map((p) => p.code) ?? [];
      console.log(`   Permissions (${permCodes.length}):`, permCodes);
    }
  }
  console.log(`========================================\n`);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
