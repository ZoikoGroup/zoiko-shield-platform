import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  CreatePaymentResult,
  PaymentProvider,
  RefundResult,
} from './payment-provider.interface';

/**
 * Deterministic, no-network payment provider used until a real processor
 * (Stripe/Adyen/etc.) is configured. NEVER a production settlement
 * authority — mirrors the existing DevCheckpointSigner pattern in this
 * codebase (ephemeral, dev/test only, logs loudly on use).
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(ManualPaymentProvider.name);

  constructor() {
    this.logger.warn(
      'ManualPaymentProvider is active — development/test only, not a production payment processor.',
    );
  }

  async createPayment(
    amount: number,
    currency: string,
    paymentMethodToken: string,
  ): Promise<CreatePaymentResult> {
    const providerPaymentId = `manual-pay-${crypto.randomUUID()}`;
    // Deterministic test failure mode so callers can exercise FAILED paths.
    if (paymentMethodToken === 'token-declined') {
      return { providerPaymentId, status: 'FAILED' };
    }
    return { providerPaymentId, status: 'AUTHORIZED' };
  }

  async refundPayment(
    providerPaymentId: string,
    _amount: number,
  ): Promise<RefundResult> {
    return {
      providerRefundId: `manual-refund-${crypto.randomUUID()}`,
      status: 'SUCCEEDED',
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expected = crypto.createHash('sha256').update(payload).digest('hex');
    return expected === signature;
  }
}
