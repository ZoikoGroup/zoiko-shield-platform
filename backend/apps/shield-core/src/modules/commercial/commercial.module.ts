import { Module } from '@nestjs/common';
import { CommercialEntitlementController } from './commercial-entitlement.controller';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SectorPacksModule } from '../sector-packs/sector-packs.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';
import { ClaimRegisterController } from './claim-register.controller';
import { ClaimRegisterService } from './claim-register.service';

@Module({
  imports: [PrismaModule, SectorPacksModule, KillSwitchModule],
  controllers: [CommercialEntitlementController, ClaimRegisterController],
  providers: [CommercialEntitlementService, ClaimRegisterService],
  exports: [CommercialEntitlementService, ClaimRegisterService],
})
export class CommercialModule {}
