import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { assertTransition } from '../commerce/state-machine.util';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import type { PaymentProvider } from './payment-provider.interface';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';

/** ZS-COM-BILL-001 Part 9 canonical payment lifecycle. */
const PAYMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['AUTHORIZED', 'FAILED'],
  AUTHORIZED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: ['SETTLED', 'DISPUTED'],
  SETTLED: ['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'],
  FAILED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  DISPUTED: ['REVERSED', 'SETTLED'],
  REVERSED: [],
};

const WEBHOOK_EVENT_TO_STATUS: Record<string, string> = {
  'payment.processing': 'PROCESSING',
  'payment.succeeded': 'SUCCEEDED',
  'payment.settled': 'SETTLED',
  'payment.failed': 'FAILED',
  'payment.disputed': 'DISPUTED',
  'payment.reversed': 'REVERSED',
};

export class CreatePaymentDto {
  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  invoiceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  paymentMethodToken!: string;
}

export class ProviderWebhookDto {
  @IsString()
  providerPaymentId!: string;

  @IsIn(Object.keys(WEBHOOK_EVENT_TO_STATUS))
  eventType!: string;

  @IsString()
  payload!: string;

  @IsString()
  signature!: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly killSwitchService: CommercialKillSwitchService,
  ) {}

  async getPaymentById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment '${paymentId}' not found`);
    }
    return payment;
  }

  async getPaymentByIdForTenant(tenantId: string, paymentId: string) {
    const payment = await this.getPaymentById(paymentId);
    const entitlement = await this.prisma.entitlement.findFirst({
      where: { tenant_id: tenantId, commercial_account_id: payment.commercial_account_id },
      select: { id: true },
    });
    if (!entitlement) {
      throw new NotFoundException(`Payment '${paymentId}' not found`);
    }
    return payment;
  }

  /**
   * Part 12/9 sequencing: only an ISSUED (immutable) invoice can be paid —
   * the price/tax/invoice basis must already be frozen.
   */
  async createPayment(tenantId: string, dto: CreatePaymentDto, idempotencyKey: string) {
    await this.killSwitchService.assertNotBlocked('AUTOMATIC_CHARGING');

    const entitlement = await this.prisma.entitlement.findFirst({
      where: { tenant_id: tenantId, commercial_account_id: dto.commercialAccountId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!entitlement) {
      throw new NotFoundException('No active entitlement connects this tenant to the commercial account');
    }

    const invoice = await this.prisma.commercialInvoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${dto.invoiceId}' not found`);
    }
    if (invoice.status !== 'ISSUED') {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_NOT_ISSUED',
        message: `Invoice '${dto.invoiceId}' is '${invoice.status}', not ISSUED — cannot accept payment against a mutable draft`,
      });
    }

    const currency = dto.currency || invoice.currency;

    const result = await this.idempotencyService.run(
      {
        key: idempotencyKey,
        operation: 'payments.create',
        tenantId,
        requestPayload: dto,
      },
      async () => {
        const providerResult = await this.provider.createPayment(dto.amount, currency, dto.paymentMethodToken);

        const payment = await this.prisma.$transaction(async (tx) => {
          const created = await tx.payment.create({
            data: {
              commercial_account_id: dto.commercialAccountId,
              invoice_id: dto.invoiceId,
              provider: 'manual',
              provider_payment_id: providerResult.providerPaymentId,
              amount: dto.amount,
              currency,
              status: providerResult.status === 'AUTHORIZED' ? 'AUTHORIZED' : 'FAILED',
              idempotency_key: idempotencyKey,
            },
          });

          await tx.commercialEvent.create({
            data: {
              event_type: 'payment.created',
              tenant_id: dto.commercialAccountId,
              actor: 'system',
              payload: JSON.stringify({ paymentId: created.id, status: created.status }),
              idempotency_key: `payment-created-${created.id}`,
            },
          });

          return created;
        });

        return { statusCode: 201, body: payment };
      },
    );

    return result.body;
  }

  async transitionStatus(paymentId: string, targetStatus: string, actor = 'system') {
    const payment = await this.getPaymentById(paymentId);
    assertTransition(PAYMENT_TRANSITIONS, payment.status, targetStatus, 'payment');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({ where: { id: paymentId }, data: { status: targetStatus } });
      await tx.commercialEvent.create({
        data: {
          event_type: 'payment.state_changed',
          tenant_id: payment.commercial_account_id,
          actor,
          payload: JSON.stringify({ paymentId, previousStatus: payment.status, newStatus: targetStatus }),
          idempotency_key: `payment-transition-${paymentId}-${targetStatus}-${Date.now()}`,
        },
      });
      return updated;
    });
  }

  /**
   * Part 9/Part 33: duplicate processor webhook deliveries must be safe —
   * routed through IdempotencyService keyed on the provider event so a
   * replayed webhook never double-applies a state change.
   */
  async handleProviderWebhook(dto: ProviderWebhookDto) {
    if (!this.provider.verifyWebhookSignature(dto.payload, dto.signature)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVALID_WEBHOOK_SIGNATURE',
        message: 'Payment provider webhook signature verification failed',
      });
    }

    const key = `webhook-${dto.providerPaymentId}-${dto.eventType}`;
    const result = await this.idempotencyService.run(
      { key, operation: 'payments.webhook', requestPayload: dto },
      async () => {
        const payment = await this.prisma.payment.findFirst({
          where: { provider_payment_id: dto.providerPaymentId },
        });
        if (!payment) {
          throw new NotFoundException(`No payment found for provider payment '${dto.providerPaymentId}'`);
        }

        const targetStatus = WEBHOOK_EVENT_TO_STATUS[dto.eventType];
        const updated = await this.transitionStatus(payment.id, targetStatus, 'provider-webhook');
        return { statusCode: 200, body: updated };
      },
    );

    return result.body;
  }

  /**
   * Part 9: a SETTLED or already-PARTIALLY_REFUNDED payment can accept
   * further refunds until its refundable balance reaches zero — never
   * over-refunded across any number of partial refunds.
   */
  async refundPayment(paymentId: string, amount: number, reason: string) {
    const payment = await this.getPaymentById(paymentId);
    if (payment.status !== 'SETTLED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new ConflictException({
        statusCode: 409,
        error: 'PAYMENT_NOT_REFUNDABLE',
        message: `Payment '${paymentId}' is '${payment.status}' — only SETTLED or PARTIALLY_REFUNDED payments can be refunded`,
      });
    }

    const priorRefunds = await this.prisma.refund.findMany({
      where: { payment_id: paymentId, status: 'SUCCEEDED' },
    });
    const alreadyRefunded = priorRefunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const refundableBalance = Number(payment.amount) - alreadyRefunded;

    if (amount > refundableBalance) {
      throw new ConflictException({
        statusCode: 409,
        error: 'REFUND_EXCEEDS_REFUNDABLE_BALANCE',
        message: `Refund amount ${amount} exceeds refundable balance ${refundableBalance} (payment ${payment.amount}, already refunded ${alreadyRefunded})`,
      });
    }

    const providerResult = await this.provider.refundPayment(payment.provider_payment_id || '', amount);

    const refund = await this.prisma.refund.create({
      data: {
        payment_id: paymentId,
        amount,
        currency: payment.currency,
        reason,
        status: providerResult.status,
      },
    });

    if (providerResult.status === 'SUCCEEDED') {
      const remainingAfterThisRefund = refundableBalance - amount;
      if (remainingAfterThisRefund === 0) {
        await this.transitionStatus(paymentId, 'REFUNDED', 'system');
      } else if (payment.status === 'SETTLED') {
        await this.transitionStatus(paymentId, 'PARTIALLY_REFUNDED', 'system');
      }
      // else: already PARTIALLY_REFUNDED and balance remains — no state
      // transition needed, the Refund row itself is the record of this action.
    }

    return refund;
  }

  async refundPaymentForTenant(tenantId: string, paymentId: string, amount: number, reason: string) {
    await this.getPaymentByIdForTenant(tenantId, paymentId);
    return this.refundPayment(paymentId, amount, reason);
  }
}
