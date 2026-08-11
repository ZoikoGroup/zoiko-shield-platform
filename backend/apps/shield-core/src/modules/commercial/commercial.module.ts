import { Module } from '@nestjs/common';
import { CommercialEntitlementController } from './commercial-entitlement.controller';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SectorPacksModule } from '../sector-packs/sector-packs.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';

@Module({
  imports: [PrismaModule, SectorPacksModule, KillSwitchModule],
  controllers: [CommercialEntitlementController],
  providers: [CommercialEntitlementService],
  exports: [CommercialEntitlementService],
})
export class CommercialModule {}
