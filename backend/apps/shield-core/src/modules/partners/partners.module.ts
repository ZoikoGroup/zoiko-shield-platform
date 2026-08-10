import { Module } from '@nestjs/common';
import { PartnerController, PartnerDelegationController } from './partner.controller';
import { PartnerService } from './partner.service';
import { PartnerDelegationService } from './partner-delegation.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PartnerController, PartnerDelegationController],
  providers: [PartnerService, PartnerDelegationService],
  exports: [PartnerService, PartnerDelegationService],
})
export class PartnersModule {}
