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
  ],
})
export class ShieldIngestModule {}

