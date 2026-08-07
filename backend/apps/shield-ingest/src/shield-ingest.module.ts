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
import { KafkaModule } from './kafka/kafka.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [
    ShieldIngestController,
    EntraConnectorController,
    EntraWebhookController,
  ],

  providers: [
    ShieldIngestService,
    EntraAuthService,
    EntraGraphClient,
    EntraDeltaSyncService,
    EntraPollerService,
    EntraNormalizerService,
  ],
})
export class ShieldIngestModule {}
