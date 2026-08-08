import { Module } from '@nestjs/common';
import { CommercialEntitlementController } from './commercial-entitlement.controller';
import { CommercialEntitlementService } from './commercial-entitlement.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CommercialEntitlementController],
  providers: [CommercialEntitlementService],
  exports: [CommercialEntitlementService],
})
export class CommercialModule {}
