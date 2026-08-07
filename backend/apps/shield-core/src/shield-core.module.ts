import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ShieldCoreController } from './shield-core.controller';
import { ShieldCoreService } from './shield-core.service';
import { TenantModule } from './modules/tenant/tenant.module';
import { CustomerModule } from './modules/customer/customer.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { LegalEntityModule } from './modules/legal-entity/legal-entity.module';
import { EnvironmentModule } from './modules/environment/environment.module';
import { IdentityAdapterModule } from './modules/identity-adapter/identity-adapter.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { Principal } from './modules/identity-adapter/principal.entity';
import { LocalCredential } from './modules/identity-adapter/local-credential.entity';
import { ExternalIdentity } from './modules/identity-adapter/external-identity.entity';
import { Session } from './modules/identity-adapter/session.entity';
import { VerificationChallenge } from './modules/identity-adapter/verification-challenge.entity';
import { RecoveryGrant } from './modules/identity-adapter/recovery-grant.entity';
import { PolicyDocument } from './modules/identity-adapter/policy-document.entity';
import { PolicyAcceptance } from './modules/identity-adapter/policy-acceptance.entity';
import { IdentityEvent } from './modules/identity-adapter/identity-event.entity';
import { Permission } from './modules/authorization/entities/permission.entity';
import { Role } from './modules/authorization/entities/role.entity';
import { TenantMembership } from './modules/authorization/entities/tenant-membership.entity';
import { Invitation } from './modules/authorization/entities/invitation.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
    }),
    TypeOrmModule.forRoot({
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
      synchronize: process.env.NODE_ENV !== 'production',
      ssl: process.env.DATABASE_URL?.includes('sslmode=require')
        ? { rejectUnauthorized: false }
        : false,
    }),
    TenantModule,
    CustomerModule,
    OrganizationModule,
    LegalEntityModule,
    EnvironmentModule,
    IdentityAdapterModule,
    AuthorizationModule,
  ],
  controllers: [ShieldCoreController],
  providers: [ShieldCoreService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ShieldCoreModule {}
