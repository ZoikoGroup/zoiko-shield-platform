import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DeclaredAccessGuard } from './security/declared-access.guard';
import { ShieldCoreController } from './shield-core.controller';
import { ShieldCoreService } from './shield-core.service';
import { TenantModule } from './modules/tenant/tenant.module';
import { CustomerModule } from './modules/customer/customer.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { LegalEntityModule } from './modules/legal-entity/legal-entity.module';
import { EnvironmentModule } from './modules/environment/environment.module';
import { IdentityAdapterModule } from './modules/identity-adapter/identity-adapter.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { SHIELD_CORE_TYPEORM_ENTITIES } from './typeorm-entities';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CommercialModule } from './modules/commercial/commercial.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { ObligationsModule } from './modules/obligations/obligations.module';
import { BillingModule } from './modules/billing/billing.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { CpqModule } from './modules/cpq/cpq.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { MeteringModule } from './modules/metering/metering.module';
import { ManagedDefenseModule } from './modules/managed-defense/managed-defense.module';
import { ContinuousAssuranceModule } from './modules/continuous-assurance/continuous-assurance.module';
import { TaxModule } from './modules/tax/tax.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { DunningModule } from './modules/dunning/dunning.module';
import { SlaModule } from './modules/sla/sla.module';
import { IrWorkOrdersModule } from './modules/ir-work-orders/ir-work-orders.module';
import { ProfessionalServicesModule } from './modules/professional-services/professional-services.module';
import { PartnersModule } from './modules/partners/partners.module';
import { SectorPacksModule } from './modules/sector-packs/sector-packs.module';
import { AiGovernanceModule } from './modules/ai-governance/ai-governance.module';
import { CostRecordsModule } from './modules/cost-records/cost-records.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { KillSwitchModule } from './modules/kill-switch/kill-switch.module';
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
import { CryptoGovernanceModule } from './modules/crypto-governance/crypto-governance.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { BreakGlassModule } from './modules/break-glass/break-glass.module';
import { VerifiableCredentialsModule } from './modules/verifiable-credentials/verifiable-credentials.module';
import { HomomorphicModule } from './modules/homomorphic/homomorphic.module';
import { DevicePostureModule } from './modules/device-posture/device-posture.module';
import { CryptoEscrowModule } from './modules/crypto-escrow/crypto-escrow.module';
import { WorkflowModule } from './modules/workflows/workflow.module';
import { ObservabilityExporterModule } from './modules/observability/observability-exporter.module';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import { RateLimitingModule } from './modules/rate-limiting/rate-limiting.module';
import { WorkloadIdentityModule } from './modules/workload-identity/workload-identity.module';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HumanAuthorityModule } from './modules/human-authority/human-authority.module';
import { EventStreamModule } from './modules/events/event-stream.module';
import { ExperienceModule } from './modules/experience/experience.module';
import { ConnectorsProxyModule } from './modules/connectors-proxy/connectors-proxy.module';
import { AnchorProxyModule } from './modules/anchor-proxy/anchor-proxy.module';
import { RequirementsRegisterModule } from './modules/requirements-register/requirements-register.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 60 }],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: SHIELD_CORE_TYPEORM_ENTITIES,
      // Safety Rule: synchronize is strictly disabled by default to prevent silent table/data drops across restarts.
      // Schema evolution is governed by controlled SQL / Prisma migrations.
      synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
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
    IdempotencyModule,
    ApprovalsModule,
    CpqModule,
    ResourcesModule,
    MeteringModule,
    ManagedDefenseModule,
    ContinuousAssuranceModule,
    TaxModule,
    PaymentsModule,
    DunningModule,
    SlaModule,
    IrWorkOrdersModule,
    ProfessionalServicesModule,
    PartnersModule,
    SectorPacksModule,
    AiGovernanceModule,
    HumanAuthorityModule,
    CostRecordsModule,
    ReconciliationModule,
    KillSwitchModule,
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
    CryptoGovernanceModule,
    PrivacyModule,
    BreakGlassModule,
    VerifiableCredentialsModule,
    HomomorphicModule,
    DevicePostureModule,
    CryptoEscrowModule,
    WorkflowModule,
    ObservabilityExporterModule,
    DiagnosticsModule,
    RateLimitingModule,
    WorkloadIdentityModule,
    EventStreamModule,
    ExperienceModule,
    ConnectorsProxyModule,
    AnchorProxyModule,
    OutboxModule,
    RequirementsRegisterModule,
  ],
  controllers: [ShieldCoreController],
  providers: [
    ShieldCoreService,
    OutboxPublisherService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: DeclaredAccessGuard },
  ],
})
export class ShieldCoreModule {}
