import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';

describe('PaymentService (ZS-COM-BILL-001 Part 9)', () => {
  let service: PaymentService;
  let prismaMock: any;
  let idempotencyMock: any;
  let providerMock: any;
  let killSwitchMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialInvoice: { findUnique: jest.fn() },
      entitlement: { findFirst: jest.fn().mockResolvedValue({ id: 'entitlement-1' }) },
      payment: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      refund: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      commercialEvent: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((cb) => cb(prismaMock)),
    };
    idempotencyMock = {
      run: jest.fn().mockImplementation(async (_p, fn) => {
        const result = await fn();
        return { ...result, replayed: false };
      }),
    };
    providerMock = {
      createPayment: jest.fn(),
      refundPayment: jest.fn(),
      verifyWebhookSignature: jest.fn(),
    };
    killSwitchMock = { assertNotBlocked: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: IdempotencyService, useValue: idempotencyMock },
        { provide: PAYMENT_PROVIDER, useValue: providerMock },
        { provide: CommercialKillSwitchService, useValue: killSwitchMock },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  const dto = {
    commercialAccountId: 'acct-1',
    invoiceId: 'inv-1',
    amount: 100,
    paymentMethodToken: 'tok-1',
  };

  it('refuses to accept payment against a non-ISSUED (mutable) invoice', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'DRAFT', currency: 'USD' });

    await expect(service.createPayment('tenant-a', dto, 'idem-1')).rejects.toThrow(ConflictException);
    expect(providerMock.createPayment).not.toHaveBeenCalled();
  });

  it('creates an AUTHORIZED payment against an ISSUED invoice', async () => {
    prismaMock.commercialInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'ISSUED', currency: 'USD' });
    providerMock.createPayment.mockResolvedValue({ providerPaymentId: 'p-1', status: 'AUTHORIZED' });
    prismaMock.payment.create.mockResolvedValue({ id: 'pay-1', status: 'AUTHORIZED' });

    const payment = await service.createPayment('tenant-a', dto, 'idem-1');

    expect(payment.status).toBe('AUTHORIZED');
  });

  it('OPS-01: refuses to charge while the kill switch blocks AUTOMATIC_CHARGING', async () => {
    killSwitchMock.assertNotBlocked.mockRejectedValue(new ConflictException('blocked'));

    await expect(service.createPayment('tenant-a', dto, 'idem-1')).rejects.toThrow(ConflictException);
    expect(prismaMock.commercialInvoice.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an illegal payment transition (e.g. PENDING straight to SETTLED)', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'PENDING', commercial_account_id: 'acct-1' });

    await expect(service.transitionStatus('pay-1', 'SETTLED')).rejects.toThrow(ConflictException);
  });

  it('refuses to refund a payment that is not SETTLED', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'AUTHORIZED', amount: 100 });

    await expect(service.refundPayment('pay-1', 50, 'customer request')).rejects.toThrow(ConflictException);
    expect(providerMock.refundPayment).not.toHaveBeenCalled();
  });

  it('refuses to refund more than the original payment amount', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'SETTLED', amount: 100 });

    await expect(service.refundPayment('pay-1', 150, 'x')).rejects.toThrow(ConflictException);
  });

  it('a partial refund moves the payment to PARTIALLY_REFUNDED, not REFUNDED', async () => {
    prismaMock.payment.findUnique
      .mockResolvedValueOnce({ id: 'pay-1', status: 'SETTLED', amount: 100, currency: 'USD', provider_payment_id: 'p-1' })
      .mockResolvedValueOnce({ id: 'pay-1', status: 'SETTLED', commercial_account_id: 'acct-1' });
    providerMock.refundPayment.mockResolvedValue({ providerRefundId: 'r-1', status: 'SUCCEEDED' });
    prismaMock.refund.create.mockResolvedValue({ id: 'refund-1', status: 'SUCCEEDED' });
    prismaMock.payment.update.mockResolvedValue({ id: 'pay-1', status: 'PARTIALLY_REFUNDED' });

    await service.refundPayment('pay-1', 40, 'partial issue');

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PARTIALLY_REFUNDED' } }),
    );
  });

  it('allows a second partial refund that exactly exhausts the remaining balance, moving to REFUNDED', async () => {
    prismaMock.payment.findUnique
      .mockResolvedValueOnce({ id: 'pay-1', status: 'PARTIALLY_REFUNDED', amount: 100, currency: 'USD', provider_payment_id: 'p-1' })
      .mockResolvedValueOnce({ id: 'pay-1', status: 'PARTIALLY_REFUNDED', commercial_account_id: 'acct-1' });
    prismaMock.refund.findMany.mockResolvedValue([{ amount: 40, status: 'SUCCEEDED' }]);
    providerMock.refundPayment.mockResolvedValue({ providerRefundId: 'r-2', status: 'SUCCEEDED' });
    prismaMock.refund.create.mockResolvedValue({ id: 'refund-2', status: 'SUCCEEDED' });
    prismaMock.payment.update.mockResolvedValue({ id: 'pay-1', status: 'REFUNDED' });

    await service.refundPayment('pay-1', 60, 'remaining balance');

    expect(prismaMock.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REFUNDED' } }),
    );
  });

  it('allows a partial refund that leaves a remaining balance without forcing a state transition', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'PARTIALLY_REFUNDED', amount: 100, currency: 'USD', provider_payment_id: 'p-1' });
    prismaMock.refund.findMany.mockResolvedValue([{ amount: 40, status: 'SUCCEEDED' }]);
    providerMock.refundPayment.mockResolvedValue({ providerRefundId: 'r-3', status: 'SUCCEEDED' });
    prismaMock.refund.create.mockResolvedValue({ id: 'refund-3', status: 'SUCCEEDED' });

    await service.refundPayment('pay-1', 20, 'partial again');

    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('rejects a refund exceeding the remaining refundable balance across multiple partials', async () => {
    prismaMock.payment.findUnique.mockResolvedValue({ id: 'pay-1', status: 'PARTIALLY_REFUNDED', amount: 100 });
    prismaMock.refund.findMany.mockResolvedValue([{ amount: 40, status: 'SUCCEEDED' }]);

    await expect(service.refundPayment('pay-1', 61, 'too much')).rejects.toThrow(ConflictException);
    expect(providerMock.refundPayment).not.toHaveBeenCalled();
  });

  it('rejects a webhook with an invalid signature rather than trusting the payload', async () => {
    providerMock.verifyWebhookSignature.mockReturnValue(false);

    await expect(
      service.handleProviderWebhook({
        providerPaymentId: 'p-1',
        eventType: 'payment.succeeded',
        payload: '{}',
        signature: 'bad',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('404s a webhook for a payment provider ID it does not recognize', async () => {
    providerMock.verifyWebhookSignature.mockReturnValue(true);
    prismaMock.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.handleProviderWebhook({
        providerPaymentId: 'unknown',
        eventType: 'payment.succeeded',
        payload: '{}',
        signature: 'sig',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
