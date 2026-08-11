import { Module } from '@nestjs/common';
import { PartnerController, PartnerDelegationController, PartnerSettlementController } from './partner.controller';
import { PartnerService } from './partner.service';
import { PartnerDelegationService } from './partner-delegation.service';
import { PartnerSettlementService } from './partner-settlement.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PartnerController, PartnerDelegationController, PartnerSettlementController],
  providers: [PartnerService, PartnerDelegationService, PartnerSettlementService],
  exports: [PartnerService, PartnerDelegationService, PartnerSettlementService],
})
export class PartnersModule {}
