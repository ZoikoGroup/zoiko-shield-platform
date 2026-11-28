import { Module } from '@nestjs/common';
import { ConnectorsProxyController } from './connectors-proxy.controller';
import { AlertRulesController } from './alert-rules.controller';
import { IngestionWebhookGatewayController } from './ingestion-webhook-gateway.controller';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';

@Module({
  controllers: [
    ConnectorsProxyController,
    IngestionWebhookGatewayController,
    AlertRulesController,
  ],
  providers: [ShieldIngestClient],
  exports: [ShieldIngestClient],
})
export class ConnectorsProxyModule {}
