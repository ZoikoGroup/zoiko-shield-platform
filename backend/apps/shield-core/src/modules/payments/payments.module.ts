import { Module } from '@nestjs/common';
import { PaymentController, PaymentWebhookController } from './payment.controller';
import { PaymentService } from './payment.service';
import { ManualPaymentProvider } from './manual-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { KillSwitchModule } from '../kill-switch/kill-switch.module';

@Module({
  imports: [PrismaModule, IdempotencyModule, KillSwitchModule],
  controllers: [PaymentController, PaymentWebhookController],
  providers: [PaymentService, ManualPaymentProvider, { provide: PAYMENT_PROVIDER, useExisting: ManualPaymentProvider }],
  exports: [PaymentService],
})
export class PaymentsModule {}
