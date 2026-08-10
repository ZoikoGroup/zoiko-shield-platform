import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { InvoiceSkeletonService } from './invoice-skeleton.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { TaxModule } from '../tax/tax.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';

@Module({
  imports: [PrismaModule, TaxModule, KillSwitchModule],
  controllers: [BillingController],
  providers: [InvoiceSkeletonService],
  exports: [InvoiceSkeletonService],
})
export class BillingModule {}
