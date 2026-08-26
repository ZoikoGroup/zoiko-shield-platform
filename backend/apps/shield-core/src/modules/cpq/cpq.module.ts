import { Module } from '@nestjs/common';
import {
  OrderController,
  PlatformOfferReadinessController,
  QuoteController,
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
import {
  CommercialConcessionController,
  PlatformSubscriptionChangeController,
  TenantSubscriptionController,
} from './subscription-change.controller';
import { ConcessionService } from './concession.service';
import { OfferReadinessService } from './offer-readiness.service';
import { TaxModule } from '../tax/tax.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { RoadmapCommitmentService } from './roadmap-commitment.service';
import {
  PlatformRoadmapCommitmentController,
  TenantRoadmapCommitmentController,
} from './roadmap-commitment.controller';
import { DiscountApprovalService } from './discount-approval.service';
import {
  PlatformDiscountAuthorityPolicyController,
  TenantQuoteDiscountReviewController,
} from './discount-approval.controller';

@Module({
  imports: [
    PrismaModule,
    CatalogModule,
    CommerceModule,
    ApprovalsModule,
    IdempotencyModule,
    KillSwitchModule,
    TaxModule,
    EvidenceModule,
  ],
  controllers: [
    QuoteController,
    OrderController,
    PlatformOfferReadinessController,
    TenantRoadmapCommitmentController,
    PlatformRoadmapCommitmentController,
    PlatformDiscountAuthorityPolicyController,
    TenantQuoteDiscountReviewController,
    TenantSubscriptionController,
    PlatformSubscriptionChangeController,
    CommercialConcessionController,
  ],
  providers: [
    QuoteService,
    OrderService,
    SubscriptionService,
    ConcessionService,
    OfferReadinessService,
    RoadmapCommitmentService,
    DiscountApprovalService,
  ],
  exports: [
    QuoteService,
    OrderService,
    SubscriptionService,
    ConcessionService,
    OfferReadinessService,
    RoadmapCommitmentService,
    DiscountApprovalService,
  ],
})
export class CpqModule {}
