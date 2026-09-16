import { Module } from '@nestjs/common';
import { AnchorProxyController } from './anchor-proxy.controller';
import { ShieldAnchorClient } from '../../internal-client/shield-anchor.client';

@Module({
  controllers: [AnchorProxyController],
  providers: [ShieldAnchorClient],
  exports: [ShieldAnchorClient],
})
export class AnchorProxyModule {}
