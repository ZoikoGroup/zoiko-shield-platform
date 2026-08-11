/**
 * ZS-COM-BILL-001 Part 9: PaymentService must not be coupled to a single
 * processor. `payment_method_reference` and everything crossing this
 * interface is a provider-issued token — raw PAN/CVC never enters this
 * codebase.
 */
export interface CreatePaymentResult {
  providerPaymentId: string;
  status: 'AUTHORIZED' | 'FAILED';
}

export interface RefundResult {
  providerRefundId: string;
  status: 'SUCCEEDED' | 'FAILED';
}

export interface PaymentProvider {
  createPayment(amount: number, currency: string, paymentMethodToken: string): Promise<CreatePaymentResult>;
  refundPayment(providerPaymentId: string, amount: number): Promise<RefundResult>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
