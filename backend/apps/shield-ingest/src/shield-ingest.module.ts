import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ShieldIngestController } from './shield-ingest.controller';
import { ShieldIngestService } from './shield-ingest.service';
import { EntraConnectorController } from './connectors/providers/microsoft-entra/entra.connector.controller';
import { EntraConnectorService } from './connectors/providers/microsoft-entra/entra.connector';
import { EntraAuthService } from './connectors/providers/microsoft-entra/entra.auth';
import { EntraTokenService } from './connectors/providers/microsoft-entra/entra.token.service';
import { EntraGraphClient } from './connectors/providers/microsoft-entra/entra.client';
import { EntraUserSyncService } from './connectors/providers/microsoft-entra/entra.user-sync';
import { EntraSignInSyncService } from './connectors/providers/microsoft-entra/entra.signin-sync';
import { EntraNormalizerService } from './connectors/providers/microsoft-entra/entra.normalizer';
import { EntraEventHubConsumer } from './connectors/providers/microsoft-entra/entra.event-hub.consumer';
import { EntraWebhookController } from './connectors/providers/microsoft-entra/entra.webhook.controller';
import { EntraHealthService } from './connectors/providers/microsoft-entra/entra.health';

import { ConnectorRegistry } from './connectors/core/connector-registry';
import { CredentialService } from './connectors/services/credential.service';
import { PermissionService } from './connectors/services/permission.service';
import { ConnectorCheckpointService } from './connectors/services/checkpoint.service';
import { ConnectorHealthService } from './connectors/services/health.service';
import { ConnectorSyncService } from './connectors/services/sync.service';

import { WebhookIngestController } from './ingestion/webhook-ingest.controller';
import { RawIngestService } from './ingestion/raw-ingest.service';
import { ConnectorCatalogController } from './connectors/connector-catalog.controller';
import { ConnectorCatalogService } from './connectors/connector-catalog.service';
import { KafkaModule } from './kafka/kafka.module';
import { PrismaModule } from './prisma/prisma.module';

import { NormalizationController } from './normalization/normalization.controller';
import { NormalizationService } from './normalization/normalization.service';

import { AssetIdentityContextController } from './context/asset-identity-context.controller';
import { AssetIdentityContextService } from './context/asset-identity-context.service';

import { DetectionEngineController } from './detection/detection-engine.controller';
import { DetectionEngineService } from './detection/detection-engine.service';

import { AlertGeneratorController } from './alerts/alert-generator.controller';
import { AlertGeneratorService } from './alerts/alert-generator.service';

import { MeteringController } from './metering/metering.controller';
import { MeteringService } from './metering/metering.service';

import { CaseManagementController } from './cases/case-management.controller';
import { CaseManagementService } from './cases/case-management.service';

import { HumanDecisionController } from './decisions/human-decision.controller';
import { HumanDecisionService } from './decisions/human-decision.service';

import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

import { ReplayEngineService } from './normalization/replay-engine.service';
import { AlertThrottlerService } from './alerts/alert-throttler.service';

import { EvidenceController } from './evidence/evidence.controller';
import { EvidenceService } from './evidence/evidence.service';

import { ControlTestingController } from './controls/control-testing.controller';
import { ControlTestingService } from './controls/control-testing.service';

import { AssuranceReviewController } from './assurance/assurance-review.controller';
import { AssuranceReviewService } from './assurance/assurance-review.service';

import { SLAClaimController } from './sla/sla-claim.controller';
import { SLAClaimService } from './sla/sla-claim.service';

import { APP_GUARD } from '@nestjs/core';
import { WorkloadAuthGuard } from './security/workload-auth.guard';
import { WebhookSignatureGuard } from './ingestion/guards/webhook-signature.guard';
import { OutboxService } from './outbox/outbox.service';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { PrismaService as IngestPrismaService } from './prisma/prisma.service';
import { PrismaService as CorePrismaService } from '../../shield-core/src/prisma/prisma.service';
import { EvidenceService as CanonicalEvidenceService } from '../../shield-core/src/modules/evidence/services/evidence.service';
import { EvidenceVerificationService } from '../../shield-core/src/modules/evidence/verification/evidence-verification.service';
import { EvidenceRepository } from '../../shield-core/src/modules/evidence/repositories/evidence.repository';
import { EvidenceLedgerService } from '../../shield-core/src/modules/evidence/ledger/evidence-ledger.service';
import { EvidenceLineageService } from '../../shield-core/src/modules/evidence/lineage/evidence-lineage.service';
import { ContentHashService } from '../../shield-core/src/modules/evidence/hashing/content-hash.service';
import { ObjectStorageService } from '../../shield-core/src/modules/evidence/storage/object-storage.service';
import { OutboxService as CoreOutboxService } from '../../shield-core/src/outbox/outbox.service';
import { IdempotencyService } from '../../shield-core/src/modules/idempotency/idempotency.service';

@Module({
  imports: [PrismaModule, KafkaModule, ScheduleModule.forRoot()],
  controllers: [
    ShieldIngestController,
    EntraConnectorController,
    EntraWebhookController,
    WebhookIngestController,
    ConnectorCatalogController,
    NormalizationController,
    AssetIdentityContextController,
    DetectionEngineController,
    AlertGeneratorController,
    MeteringController,
    CaseManagementController,
    HumanDecisionController,
    DashboardController,
    EvidenceController,
    ControlTestingController,
    AssuranceReviewController,
    SLAClaimController,
  ],

  providers: [
    ShieldIngestService,

    ConnectorRegistry,
    CredentialService,
    PermissionService,
    ConnectorCheckpointService,
    ConnectorHealthService,
    ConnectorSyncService,

    EntraConnectorService,
    EntraAuthService,
    EntraTokenService,
    EntraGraphClient,
    EntraUserSyncService,
    EntraSignInSyncService,
    EntraHealthService,
    EntraNormalizerService,
    EntraEventHubConsumer,
    RawIngestService,
    ConnectorCatalogService,
    NormalizationService,
    AssetIdentityContextService,
    DetectionEngineService,
    AlertGeneratorService,
    MeteringService,
    CaseManagementService,
    HumanDecisionService,
    DashboardService,
    ReplayEngineService,
    AlertThrottlerService,
    EvidenceService,
    ControlTestingService,
    AssuranceReviewService,
    SLAClaimService,
    OutboxService,
    OutboxPublisherService,
    IdempotencyService,
    { provide: CorePrismaService, useExisting: IngestPrismaService },
    CoreOutboxService,
    ContentHashService,
    ObjectStorageService,
    EvidenceRepository,
    EvidenceLedgerService,
    EvidenceLineageService,
    CanonicalEvidenceService,
    EvidenceVerificationService,
    WebhookSignatureGuard,
    { provide: APP_GUARD, useClass: WorkloadAuthGuard },
  ],
})
export class ShieldIngestModule {}
