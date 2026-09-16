import { Module } from '@nestjs/common';
import { ConnectorsProxyController } from './connectors-proxy.controller';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';

@Module({
  controllers: [ConnectorsProxyController],
  providers: [ShieldIngestClient],
  exports: [ShieldIngestClient],
})
export class ConnectorsProxyModule {}
