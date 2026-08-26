import { StripePaymentProvider } from './stripe-payment.provider';

describe('StripePaymentProvider', () => {
  let provider: StripePaymentProvider;

  beforeEach(() => {
    provider = new StripePaymentProvider();
  });

  it('successfully creates tokenized payment authorization', async () => {
    const res = await provider.createPayment(1500, 'USD', 'tok_visa_valid');
    expect(res.status).toBe('AUTHORIZED');
    expect(res.providerPaymentId).toMatch(/^ch_/);
  });

  it('fails payment when invalid token is provided', async () => {
    const res = await provider.createPayment(
      1500,
      'USD',
      'tok_invalid_declined',
    );
    expect(res.status).toBe('FAILED');
    expect(res.providerPaymentId).toMatch(/^ch_err_/);
  });

  it('processes refund successfully', async () => {
    const res = await provider.refundPayment('ch_valid_123456789', 500);
    expect(res.status).toBe('SUCCEEDED');
    expect(res.providerRefundId).toMatch(/^re_/);
  });

  it('verifies valid webhook signature and rejects empty/invalid signature', () => {
    expect(
      provider.verifyWebhookSignature(
        '{"type":"charge.succeeded"}',
        'sig_test_123',
      ),
    ).toBe(true);
    expect(
      provider.verifyWebhookSignature('{"type":"charge.succeeded"}', ''),
    ).toBe(false);
  });
});
