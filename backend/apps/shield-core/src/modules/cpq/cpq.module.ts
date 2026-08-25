import { Module } from '@nestjs/common';
import { QuoteController, OrderController } from './cpq.controller';
import { QuoteService } from './quote.service';
import { OrderService } from './order.service';
import { SubscriptionService } from './subscription.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CommerceModule } from '../commerce/commerce.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';
import {
  CommercialConcessionController,
  PlatformSubscriptionChangeController,
  TenantSubscriptionController,
} from './subscription-change.controller';
import { ConcessionService } from './concession.service';

@Module({
  imports: [
    PrismaModule,
    CatalogModule,
    CommerceModule,
    ApprovalsModule,
    IdempotencyModule,
    KillSwitchModule,
  ],
  controllers: [
    QuoteController,
    OrderController,
    TenantSubscriptionController,
    PlatformSubscriptionChangeController,
    CommercialConcessionController,
  ],
  providers: [
    QuoteService,
    OrderService,
    SubscriptionService,
    ConcessionService,
  ],
  exports: [QuoteService, OrderService, SubscriptionService, ConcessionService],
})
export class CpqModule {}
