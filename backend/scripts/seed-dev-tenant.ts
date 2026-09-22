import 'dotenv/config';
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'crypto';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SHIELD_CORE_TYPEORM_ENTITIES } from '../apps/shield-core/src/typeorm-entities';
import { PrismaService } from '../apps/shield-core/src/prisma/prisma.service';
import { OnboardingModule } from '../apps/shield-core/src/modules/onboarding/onboarding.module';
import { OnboardingService } from '../apps/shield-core/src/modules/onboarding/onboarding.service';
import { IdentityAdapterModule } from '../apps/shield-core/src/modules/identity-adapter/identity-adapter.module';
import { OwnerFederatedActivationService } from '../apps/shield-core/src/modules/identity-adapter/owner-federated-activation.service';
import { PolicyService } from '../apps/shield-core/src/modules/identity-adapter/policy.service';
import { Principal } from '../apps/shield-core/src/modules/identity-adapter/principal.entity';
import { LocalCredential } from '../apps/shield-core/src/modules/identity-adapter/local-credential.entity';
import { TenantMembership } from '../apps/shield-core/src/modules/authorization/entities/tenant-membership.entity';
import { Tenant } from '../apps/shield-core/src/modules/tenant/tenant.entity';
import { PLATFORM_SCOPE } from '../apps/shield-core/src/modules/authorization/constants';

/**
 * Provision a working tenant in a development environment.
 *
 * Onboarding a tenant in ZoikoShield is deliberately hard: it needs an
 * approved commercial order, a configured ZoikoID OIDC provider, and an owner
 * who activates by signing in to that provider. All three are right for
 * production, and together they meant nobody could stand up a tenant locally
 * at all — so the whole product downstream of onboarding (connectors,
 * detection, cases, evidence, export) had no tenant to run in and could only
 * ever be tested a piece at a time.
 *
 * This script supplies exactly the three missing prerequisites and nothing
 * else. It does not reimplement onboarding: it calls the same
 * OnboardingService the API calls, and completes owner activation through the
 * same OwnerFederatedActivationService the OIDC callback uses, handing it an
 * assertion this script minted instead of one an identity provider signed.
 * That assertion is the one and only thing being faked, and it is recorded as
 * such — the external identity it creates carries the issuer
 * `urn:zoikoshield:dev-seed`, so a seeded owner is always distinguishable
 * from a federated one in the database.
 *
 * It refuses to run with NODE_ENV=production.
 *
 *   npm run seed:dev-tenant -- --owner you@example.com --password 'Passw0rd!'
 */

const DEV_ASSERTION_ISSUER = 'urn:zoikoshield:dev-seed';

/**
 * ZoikoID placeholders. provisionForTenant only reads configuration — it
 * makes no call to the issuer — so a tenant can be provisioned against
 * endpoints that do not resolve. Nothing here can authenticate anyone; these
 * values exist so the provider row is well-formed.
 */
const DEV_ZOIKOID_DEFAULTS: Record<string, string> = {
  ZOIKOID_OIDC_ISSUER: 'https://id.zoiko.example',
  ZOIKOID_OIDC_AUTHORIZATION_ENDPOINT: 'https://id.zoiko.example/oauth2/authorize',
  ZOIKOID_OIDC_TOKEN_ENDPOINT: 'https://id.zoiko.example/oauth2/token',
  ZOIKOID_OIDC_JWKS_URI: 'https://id.zoiko.example/.well-known/jwks.json',
  ZOIKOID_OIDC_CLIENT_ID: 'zoikoshield-dev-seed',
  ZOIKOID_OIDC_CLIENT_SECRET_REF: 'ZOIKOID_OIDC_CLIENT_SECRET',
  ZOIKOID_OIDC_CLIENT_SECRET: 'dev-seed-not-a-real-secret',
  ZOIKOID_OIDC_SIGNING_ALGORITHM: 'RS256',
};

type Args = {
  owner: string;
  password: string;
  tenantName: string;
  tenantSlug: string;
  region: string;
};

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      flags.set(argv[i].slice(2), argv[i + 1] ?? '');
      i += 1;
    }
  }
  const suffix = Date.now().toString(36);
  const tenantName = flags.get('tenant-name') ?? 'Design Partner';
  return {
    owner: flags.get('owner') ?? `owner+${suffix}@example.com`,
    password: flags.get('password') ?? 'DevTenantOwner123!',
    tenantName,
    tenantSlug:
      flags.get('tenant-slug') ??
      `${tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${suffix}`,
    region: flags.get('region') ?? 'us-east-1',
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: SHIELD_CORE_TYPEORM_ENTITIES,
      synchronize: false,
    }),
    IdentityAdapterModule,
    OnboardingModule,
  ],
})
class SeedModule {}

/**
 * Onboarding requires a PROVISIONED commercial order, which normally comes
 * from the quote/approval chain. A development tenant gets a minimal one
 * directly so the commercial workflow is not a prerequisite for testing the
 * security product.
 */
async function ensureProvisionedOrder(prisma: PrismaService): Promise<string> {
  const catalogVersion =
    (await prisma.catalogVersion.findFirst()) ??
    (await prisma.catalogVersion.create({
      data: { id: randomUUID(), version_label: 'dev-seed', status: 'ACTIVE' },
    }));

  const product =
    (await prisma.product.findFirst({ where: { sku: 'SKU-DEV-SEED-01' } })) ??
    (await prisma.product.create({
      data: {
        id: randomUUID(),
        catalog_version_id: catalogVersion.id,
        sku: 'SKU-DEV-SEED-01',
        internal_product_key: 'dev-seed-01',
        display_name: 'ZoikoShield (development seed)',
        offer_family: 'ENTERPRISE_SUITE',
        metric_family: 'USER_LICENSES',
      },
    }));

  const account =
    (await prisma.commercialAccount.findFirst({
      where: { name: 'Development Seed Account' },
    })) ??
    (await prisma.commercialAccount.create({
      data: {
        id: randomUUID(),
        name: 'Development Seed Account',
        customer_legal_name: 'Development Seed Account Ltd',
        status: 'ACTIVE',
      },
    }));

  const quote = await prisma.commercialQuote.create({
    data: {
      id: randomUUID(),
      tenant_id: 'pending-onboarding',
      environment_id: 'pending-onboarding',
      commercial_account_id: account.id,
      catalog_version_id: catalogVersion.id,
      quote_key: `dev-seed-${Date.now()}`,
      configuration_hash: createHash('sha256')
        .update(`dev-seed-${Date.now()}`)
        .digest('hex'),
      requested_by: 'dev-seed',
      status: 'APPROVED',
    },
  });

  const order = await prisma.commercialOrder.create({
    data: {
      id: randomUUID(),
      quote_id: quote.id,
      commercial_account_id: account.id,
      idempotency_key: randomUUID(),
      created_by: 'dev-seed',
      status: 'PROVISIONED',
      lines: {
        create: [
          {
            id: randomUUID(),
            product_id: product.id,
            quantity: 1,
            unit_price: 0,
          },
        ],
      },
    },
  });

  return order.id;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seed-dev-tenant refuses to run with NODE_ENV=production. Production tenants are onboarded through the API against a real order, and their owners activate against a real ZoikoID.',
    );
  }

  const args = parseArgs(process.argv.slice(2));
  const logger = new Logger('seed-dev-tenant');

  for (const [key, value] of Object.entries(DEV_ZOIKOID_DEFAULTS)) {
    if (!process.env[key]?.trim()) {
      process.env[key] = value;
    }
  }

  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const dataSource = app.get(DataSource);
    const onboarding = app.get(OnboardingService);
    const activation = app.get(OwnerFederatedActivationService);
    const policies = app.get(PolicyService);

    const principals = dataSource.getRepository(Principal);
    const credentials = dataSource.getRepository(LocalCredential);
    const memberships = dataSource.getRepository(TenantMembership);
    const tenants = dataSource.getRepository(Tenant);

    // Onboarding is performed BY a platform super admin, so one has to exist.
    const platformMembership = await memberships.findOne({
      where: { tenantId: PLATFORM_SCOPE, status: 'ACTIVE' },
      order: { joinedAt: 'ASC' },
    });
    if (!platformMembership) {
      throw new Error(
        'No platform super admin exists. Run `npm run seed:platform-admin -- <email> <password>` first — onboarding is an action a platform admin takes.',
      );
    }

    const disclosure = await policies.findActive('ACCESS_DISCLOSURE');
    if (!disclosure) {
      throw new Error(
        'No active ACCESS_DISCLOSURE policy document. PolicyService seeds one on boot; check ACCESS_DISCLOSURE_TEXT.',
      );
    }

    const orderId = await ensureProvisionedOrder(prisma);
    logger.log(`Provisioned commercial order ${orderId}`);

    const result = await onboarding.onboard(
      {
        orderId,
        tenantName: args.tenantName,
        tenantSlug: args.tenantSlug,
        homeRegion: args.region,
        dataResidencyRegion: args.region,
        timezone: 'Etc/UTC',
        dataClass: 'CONFIDENTIAL',
        retentionPolicyRef: 'default',
        legalEntity: {
          legalName: `${args.tenantName} Ltd`,
          countryOfRegistration: 'GB',
        },
        ownerEmail: args.owner,
        environment: { name: 'Production', environmentType: 'PRODUCTION' },
        accessDisclosureVersion: disclosure.version,
      },
      platformMembership.principalId,
      { ipAddress: '127.0.0.1', userAgent: 'seed-dev-tenant' },
    );

    const activationUrl = (result.ownerInvitation as { activationUrl?: string })
      .activationUrl;
    if (!activationUrl) {
      throw new Error(
        'Onboarding did not return an activation URL. It is only included outside production — check NODE_ENV.',
      );
    }
    const invitationToken = new URL(activationUrl).searchParams.get('token');
    if (!invitationToken) {
      throw new Error(
        `Activation URL carried no token: ${activationUrl}`,
      );
    }
    logger.log(`Tenant ${result.tenant.id} provisioned; activating owner`);

    // The only fabricated step: standing in for the ZoikoID sign-in the owner
    // would complete. Everything it triggers — membership activation, tenant
    // activation, policy acceptance, the identity event trail — is the real
    // activation path, unchanged.
    await activation.complete({
      providerConfigurationId: result.identityProvider.id,
      tenantId: result.tenant.id,
      protocol: 'OIDC',
      assertion: {
        issuer: DEV_ASSERTION_ISSUER,
        subject: `dev-seed:${args.owner}`,
        email: args.owner,
        fullName: `${args.tenantName} Owner`,
        assurance: 'FEDERATED_MFA',
        claimProfile: {
          sub: `dev-seed:${args.owner}`,
          email: args.owner,
          email_verified: true,
          emailVerified: true,
          amr: ['mfa'],
        },
      },
      invitationToken,
      consent: {
        accessDisclosureVersion: disclosure.version,
        accessDisclosureAcceptedAt: new Date().toISOString(),
        metadata: { ipAddress: '127.0.0.1', userAgent: 'seed-dev-tenant' },
      },
    });

    // The owner activated federated, so they have no password. Without an
    // identity provider to sign in to, they would have no way to reach the
    // tenant they now own, so give them a local credential as well.
    const owner = await principals.findOne({ where: { email: args.owner } });
    if (!owner) {
      throw new Error(`Owner principal ${args.owner} vanished after activation`);
    }
    const passwordHash = await bcrypt.hash(args.password, 10);
    const existing = await credentials.findOne({
      where: { principalId: owner.id },
    });
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.passwordUpdatedAt = new Date();
      existing.failedAttempts = 0;
      existing.lockedUntil = null;
      await credentials.save(existing);
    } else {
      await credentials.save(
        credentials.create({
          principalId: owner.id,
          passwordHash,
          passwordUpdatedAt: new Date(),
        }),
      );
    }

    const tenant = await tenants.findOne({ where: { id: result.tenant.id } });
    const membership = await memberships.findOne({
      where: { tenantId: result.tenant.id, principalId: owner.id },
    });

    console.log(`
Development tenant ready.

  tenant id       ${result.tenant.id}
  tenant slug     ${result.tenant.slug}
  tenant status   ${tenant?.status}
  environment id  ${result.environment.id}
  region          ${args.region}

  owner email     ${args.owner}
  owner password  ${args.password}
  membership      ${membership?.status}

Log in, then send the tenant id as the x-tenant-id header:

  curl -sS -X POST http://localhost:3001/api/v1/auth/login \\
    -H 'content-type: application/json' \\
    -d '{"email":"${args.owner}","password":"${args.password}","tenantId":"${result.tenant.id}"}'
`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
