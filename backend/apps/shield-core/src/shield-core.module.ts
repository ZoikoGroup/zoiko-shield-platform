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
import { Tenant } from './modules/tenant/tenant.entity';
import { LegalEntity } from './modules/legal-entity/legal-entity.entity';
import { Environment } from './modules/environment/environment.entity';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { ObligationsModule } from './modules/obligations/obligations.module';
import { BillingModule } from './modules/billing/billing.module';
import { KafkaModule } from './kafka/kafka.module';
import { CaseManagementModule } from './modules/case-management/case-management.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { SecurityContextModule } from './modules/security-context/security-context.module';
import { DetectionModule } from './modules/detection/detection.module';
import { AuthorizationDecisionModule } from './modules/authorization-decision/authorization-decision.module';
import { ResponseProposalModule } from './modules/response-proposal/response-proposal.module';
import { ControlsModule } from './modules/controls/controls.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { RiskModule } from './modules/risk/risk.module';
import { AuditPackageModule } from './modules/audit-package/audit-package.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { NotificationModule } from './modules/notification/notification.module';
import { DeveloperApiModule } from './modules/developer-api/developer-api.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ExportModule } from './modules/export/export.module';
import { OffboardingModule } from './modules/offboarding/offboarding.module';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { PrismaModule } from './prisma/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';

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
        Tenant,
        LegalEntity,
        Environment,
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
    OnboardingModule,
    CommercialModule,
    CatalogModule,
    CommerceModule,
    ObligationsModule,
    BillingModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    KafkaModule,
    EvidenceModule,
    SecurityContextModule,
    DetectionModule,
    AuthorizationDecisionModule,
    ResponseProposalModule,
    CaseManagementModule,
    ControlsModule,
    AssessmentsModule,
    RiskModule,
    AuditPackageModule,
    ReportingModule,
    NotificationModule,
    DeveloperApiModule,
    WebhookModule,
    ExportModule,
    OffboardingModule,
  ],
  controllers: [ShieldCoreController],
  providers: [ShieldCoreService, OutboxPublisherService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ShieldCoreModule {}
