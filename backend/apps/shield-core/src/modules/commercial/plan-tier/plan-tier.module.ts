import { Module } from '@nestjs/common';
import { PlanTierService } from './plan-tier.service';
import { PlanTierController } from './plan-tier.controller';
import { OfferEntitlementService } from '../offer-entitlement.service';
import { CommercialEntitlementService } from '../commercial-entitlement.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlanTierController],
  providers: [
    PlanTierService,
    OfferEntitlementService,
    CommercialEntitlementService,
  ],
  exports: [PlanTierService],
})
export class PlanTierModule {}
