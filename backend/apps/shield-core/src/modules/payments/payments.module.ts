import { Module } from '@nestjs/common';
import {
  PaymentCheckoutController,
  PaymentController,
  PaymentWebhookController,
} from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';
import { ManualPaymentProvider } from './manual-payment.provider';
import { StripePaymentProvider } from './stripe-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    IdempotencyModule,
    KillSwitchModule,
    NotificationModule,
  ],
  controllers: [
    PaymentController,
    PaymentCheckoutController,
    PaymentWebhookController,
    PaymentMethodController,
  ],
  providers: [
    PaymentService,
    PaymentMethodService,
    ManualPaymentProvider,
    StripePaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: ManualPaymentProvider },
  ],
  exports: [PaymentService, PaymentMethodService, StripePaymentProvider],
})
export class PaymentsModule {}
