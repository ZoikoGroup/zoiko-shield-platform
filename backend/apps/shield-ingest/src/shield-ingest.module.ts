import { Module } from '@nestjs/common';
import { ShieldIngestController } from './shield-ingest.controller';
import { ShieldIngestService } from './shield-ingest.service';
import { EntraConnectorController } from './connectors/microsoft-entra/entra.connector';
import { EntraAuthService } from './connectors/microsoft-entra/entra.auth';
import { EntraGraphClient } from './connectors/microsoft-entra/entra.graph-client';
import { EntraDeltaSyncService } from './connectors/microsoft-entra/entra.delta-sync';
import { EntraPollerService } from './connectors/microsoft-entra/entra.poller';
import { EntraNormalizerService } from './connectors/microsoft-entra/entra.normalizer';
import { EntraWebhookController } from './connectors/microsoft-entra/entra.webhook.controller';
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

@Module({
  imports: [PrismaModule, KafkaModule],
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
    EntraAuthService,
    EntraGraphClient,
    EntraDeltaSyncService,
    EntraPollerService,
    EntraNormalizerService,
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
  ],
})
export class ShieldIngestModule {}

