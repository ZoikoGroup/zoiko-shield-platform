import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ShieldIngestController } from './shield-ingest.controller';
import { ShieldIngestService } from './shield-ingest.service';

import { ConnectorRegistry } from './connectors/core/connector-registry';
import { CredentialService } from './connectors/services/credential.service';
import { PermissionService } from './connectors/services/permission.service';
import { ConnectorCheckpointService } from './connectors/services/checkpoint.service';
import { ConnectorHealthService } from './connectors/services/health.service';
import { ConnectorSyncService } from './connectors/services/sync.service';

import { EntraConnectorController } from './connectors/providers/microsoft-entra/entra.connector.controller';
import { EntraConnectorService } from './connectors/providers/microsoft-entra/entra.connector';
import { EntraAuthService } from './connectors/providers/microsoft-entra/entra.auth';
import { EntraTokenService } from './connectors/providers/microsoft-entra/entra.token.service';
import { EntraGraphClient } from './connectors/providers/microsoft-entra/entra.client';
import { EntraUserSyncService } from './connectors/providers/microsoft-entra/entra.user-sync';
import { EntraSignInSyncService } from './connectors/providers/microsoft-entra/entra.signin-sync';
import { EntraNormalizerService } from './connectors/providers/microsoft-entra/entra.normalizer';
import { EntraHealthService } from './connectors/providers/microsoft-entra/entra.health';
import { EntraSchedulerService } from './connectors/providers/microsoft-entra/entra.scheduler.service';
import { EntraWebhookController } from './connectors/providers/microsoft-entra/entra.webhook.controller';
import { EntraEventHubConsumer } from './connectors/providers/microsoft-entra/entra.event-hub.consumer';

import { WebhookIngestController } from './ingestion/webhook-ingest.controller';
import { RawIngestService } from './ingestion/raw-ingest.service';
import { DeduplicationService } from './ingestion/deduplication.service';
import { ConnectorCatalogController } from './connectors/connector-catalog.controller';
import { ConnectorCatalogService } from './connectors/connector-catalog.service';
import { KafkaModule } from './kafka/kafka.module';
import { PrismaModule } from './prisma/prisma.module';

import { NormalizationController } from './normalization/normalization.controller';
import { NormalizationService } from './normalization/normalization.service';

import { OutboxService } from './outbox/outbox.service';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';

import { MeteringController } from './metering/metering.controller';
import { MeteringService } from './metering/metering.service';

@Module({
  imports: [PrismaModule, KafkaModule, ScheduleModule.forRoot()],
  controllers: [
    ShieldIngestController,
    EntraConnectorController,
    EntraWebhookController,
    WebhookIngestController,
    ConnectorCatalogController,
    NormalizationController,
    MeteringController,
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
    EntraNormalizerService,
    EntraHealthService,
    EntraSchedulerService,
    EntraEventHubConsumer,

    RawIngestService,
    DeduplicationService,
    ConnectorCatalogService,
    NormalizationService,
    OutboxService,
    OutboxPublisherService,
    MeteringService,
  ],
})
export class ShieldIngestModule {}
