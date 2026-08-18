import { Module } from '@nestjs/common';
import {
  QuoteController,
  OrderController,
  SubscriptionController,
} from './cpq.controller';
import { QuoteService } from './quote.service';
import { OrderService } from './order.service';
import { SubscriptionService } from './subscription.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CommerceModule } from '../commerce/commerce.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';

@Module({
  imports: [
    PrismaModule,
    CatalogModule,
    CommerceModule,
    ApprovalsModule,
    IdempotencyModule,
    KillSwitchModule,
  ],
  controllers: [QuoteController, OrderController, SubscriptionController],
  providers: [QuoteService, OrderService, SubscriptionService],
  exports: [QuoteService, OrderService, SubscriptionService],
})
export class CpqModule {}
