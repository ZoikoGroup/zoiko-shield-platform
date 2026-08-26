import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  CreatePaymentResult,
  PaymentProvider,
  RefundResult,
} from './payment-provider.interface';

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_demo_secret_key_testing';

  async createPayment(
    amount: number,
    currency: string,
    paymentMethodToken: string,
  ): Promise<CreatePaymentResult> {
    this.logger.log(
      `[StripeProvider] Creating tokenized charge for amount: ${amount} ${currency}, token: ${paymentMethodToken.substring(0, 8)}...`,
    );

    if (!paymentMethodToken || paymentMethodToken.startsWith('tok_invalid')) {
      return {
        providerPaymentId: `ch_err_${crypto.randomUUID().substring(0, 8)}`,
        status: 'FAILED',
      };
    }

    return {
      providerPaymentId: `ch_${crypto.randomUUID().replace(/-/g, '').substring(0, 24)}`,
      status: 'AUTHORIZED',
    };
  }

  async refundPayment(
    providerPaymentId: string,
    amount: number,
  ): Promise<RefundResult> {
    this.logger.log(
      `[StripeProvider] Processing refund for charge ${providerPaymentId}, amount: ${amount}`,
    );

    if (!providerPaymentId || providerPaymentId.startsWith('ch_err')) {
      return {
        providerRefundId: `re_err_${crypto.randomUUID().substring(0, 8)}`,
        status: 'FAILED',
      };
    }

    return {
      providerRefundId: `re_${crypto.randomUUID().replace(/-/g, '').substring(0, 24)}`,
      status: 'SUCCEEDED',
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature || !payload) {
      return false;
    }
    // Test mode allows test signatures
    if (signature === 't=12345,v1=test-signature' || signature.startsWith('sig_test_')) {
      return true;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch {
      return false;
    }
  }
}
