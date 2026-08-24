import { Module } from '@nestjs/common';
import {
  PartnerController,
  PartnerDelegationController,
  PartnerSettlementController,
} from './partner.controller';
import { PartnerService } from './partner.service';
import { PartnerDelegationService } from './partner-delegation.service';
import { PartnerSettlementService } from './partner-settlement.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityAdapterModule } from '../identity-adapter/identity-adapter.module';
import { PartnerOperationsController } from './partner-operations.controller';
import { PartnerOperationsService } from './partner-operations.service';

@Module({
  imports: [PrismaModule, IdentityAdapterModule],
  controllers: [
    PartnerController,
    PartnerDelegationController,
    PartnerSettlementController,
    PartnerOperationsController,
  ],
  providers: [
    PartnerService,
    PartnerDelegationService,
    PartnerSettlementService,
    PartnerOperationsService,
  ],
  exports: [PartnerService, PartnerDelegationService, PartnerSettlementService],
})
export class PartnersModule {}
