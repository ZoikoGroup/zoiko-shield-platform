import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { assertTransition } from '../commerce/state-machine.util';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import type { PaymentProvider } from './payment-provider.interface';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { runWithPlatformScope } from '../../../../../libs/database/src';
import { StripePaymentProvider } from './stripe-payment.provider';
import { TransactionalEmailService } from '../notification/transactional-email.service';
import { DRAFT_PLAN_TIERS } from '../commercial/plan-tier/plan-tier.entity';
import { CreateCheckoutSessionDto } from './dto/checkout-session.dto';

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

  @IsUUID()
  paymentMethodReferenceId!: string;
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
  private readonly stripePaymentProvider: StripePaymentProvider;
  private readonly checkoutSessions = new Map<string, any>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly killSwitchService: CommercialKillSwitchService,
    @Optional() stripePaymentProvider?: StripePaymentProvider,
    @Optional() private readonly emailService?: TransactionalEmailService,
  ) {
    this.stripePaymentProvider =
      stripePaymentProvider || new StripePaymentProvider();
  }

  async getPaymentById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException(`Payment '${paymentId}' not found`);
    }
    return payment;
  }

  async getPaymentByIdForTenant(tenantId: string, paymentId: string) {
    const payment = await this.getPaymentById(paymentId);
    const now = new Date();
    const binding = await this.prisma.commercialAccountTenantBinding.findFirst({
      where: {
        tenant_id: tenantId,
        commercial_account_id: payment.commercial_account_id,
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      select: { id: true },
    });
    if (!binding) {
      throw new NotFoundException(`Payment '${paymentId}' not found`);
    }
    return payment;
  }

  /**
   * Part 12/9 sequencing: only an ISSUED (immutable) invoice can be paid —
   * the price/tax/invoice basis must already be frozen.
   */
  async createPayment(
    tenantId: string,
    dto: CreatePaymentDto,
    idempotencyKey: string,
  ) {
    await this.killSwitchService.assertNotBlocked('AUTOMATIC_CHARGING');

    const now = new Date();
    const binding = await this.prisma.commercialAccountTenantBinding.findFirst({
      where: {
        tenant_id: tenantId,
        commercial_account_id: dto.commercialAccountId,
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      select: { id: true },
    });
    if (!binding) {
      throw new NotFoundException(
        'No active binding connects this tenant to the commercial account',
      );
    }

    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: dto.invoiceId },
    });
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
    if (invoice.commercial_account_id !== dto.commercialAccountId) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_ACCOUNT_MISMATCH',
        message: `Invoice '${dto.invoiceId}' does not belong to commercial account '${dto.commercialAccountId}'`,
      });
    }

    const paymentMethod = await this.prisma.paymentMethodReference.findFirst({
      where: {
        id: dto.paymentMethodReferenceId,
        commercial_account_id: dto.commercialAccountId,
        status: 'ACTIVE',
      },
    });
    if (!paymentMethod) {
      throw new NotFoundException(
        'Approved payment-method reference not found for this commercial account',
      );
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
        const providerResult = await this.provider.createPayment(
          dto.amount,
          currency,
          paymentMethod.provider_token,
        );

        const payment = await this.prisma.$transaction(async (tx) => {
          const created = await tx.payment.create({
            data: {
              commercial_account_id: dto.commercialAccountId,
              invoice_id: dto.invoiceId,
              provider: paymentMethod.provider,
              provider_payment_id: providerResult.providerPaymentId,
              amount: dto.amount,
              currency,
              payment_method_reference_id: paymentMethod.id,
              status:
                providerResult.status === 'AUTHORIZED'
                  ? 'AUTHORIZED'
                  : 'FAILED',
              idempotency_key: idempotencyKey,
            },
          });

          await tx.commercialEvent.create({
            data: {
              event_type: 'payment.created',
              tenant_id: dto.commercialAccountId,
              actor: 'system',
              payload: JSON.stringify({
                paymentId: created.id,
                status: created.status,
              }),
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

  async transitionStatus(
    paymentId: string,
    targetStatus: string,
    actor = 'system',
  ) {
    const payment = await this.getPaymentById(paymentId);
    assertTransition(
      PAYMENT_TRANSITIONS,
      payment.status,
      targetStatus,
      'payment',
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: targetStatus },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'payment.state_changed',
          tenant_id: payment.commercial_account_id,
          actor,
          payload: JSON.stringify({
            paymentId,
            previousStatus: payment.status,
            newStatus: targetStatus,
          }),
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

    // Signature verified: the processor, not a tenant user, is the caller,
    // and the payment is located by the processor's id across accounts.
    const key = `webhook-${dto.providerPaymentId}-${dto.eventType}`;
    const result = await runWithPlatformScope('payment provider webhook', () =>
      this.idempotencyService.run(
        { key, operation: 'payments.webhook', requestPayload: dto },
        async () => {
          const payment = await this.prisma.payment.findFirst({
            where: { provider_payment_id: dto.providerPaymentId },
          });
          if (!payment) {
            throw new NotFoundException(
              `No payment found for provider payment '${dto.providerPaymentId}'`,
            );
          }

          const targetStatus = WEBHOOK_EVENT_TO_STATUS[dto.eventType];
          const updated = await this.transitionStatus(
            payment.id,
            targetStatus,
            'provider-webhook',
          );
          return { statusCode: 200, body: updated };
        },
      ),
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
    if (
      payment.status !== 'SETTLED' &&
      payment.status !== 'PARTIALLY_REFUNDED'
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'PAYMENT_NOT_REFUNDABLE',
        message: `Payment '${paymentId}' is '${payment.status}' — only SETTLED or PARTIALLY_REFUNDED payments can be refunded`,
      });
    }

    const priorRefunds = await this.prisma.refund.findMany({
      where: { payment_id: paymentId, status: 'SUCCEEDED' },
    });
    const alreadyRefunded = priorRefunds.reduce(
      (sum, r) => sum + Number(r.amount),
      0,
    );
    const refundableBalance = Number(payment.amount) - alreadyRefunded;

    if (amount > refundableBalance) {
      throw new ConflictException({
        statusCode: 409,
        error: 'REFUND_EXCEEDS_REFUNDABLE_BALANCE',
        message: `Refund amount ${amount} exceeds refundable balance ${refundableBalance} (payment ${payment.amount}, already refunded ${alreadyRefunded})`,
      });
    }

    const providerResult = await this.provider.refundPayment(
      payment.provider_payment_id || '',
      amount,
    );

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

  async refundPaymentForTenant(
    tenantId: string,
    paymentId: string,
    amount: number,
    reason: string,
  ) {
    await this.getPaymentByIdForTenant(tenantId, paymentId);
    return this.refundPayment(paymentId, amount, reason);
  }

  /**
   * Creates a verified Stripe Checkout session with server-calculated pricing.
   */
  async createCheckoutSession(
    dto: CreateCheckoutSessionDto,
    tenantId?: string,
    userId?: string,
    userEmail?: string,
  ) {
    await this.killSwitchService.assertNotBlocked('AUTOMATIC_CHARGING');

    const plan = DRAFT_PLAN_TIERS.find((p) => p.key === dto.planTier);
    if (!plan) {
      throw new NotFoundException(`Plan tier '${dto.planTier}' not found in catalogue`);
    }

    const envMonthly = process.env[`PLAN_PRICE_${dto.planTier}_MONTHLY`];
    const envAnnualMonthly =
      process.env[`PLAN_PRICE_${dto.planTier}_ANNUAL_MONTHLY`];

    const monthlyRate =
      dto.billingPeriod === 'ANNUAL'
        ? (envAnnualMonthly ? Number(envAnnualMonthly) : null) ||
          plan.pricing.annualBilledMonthlyUsd ||
          (envMonthly ? Number(envMonthly) : null) ||
          plan.pricing.monthlyUsd
        : (envMonthly ? Number(envMonthly) : null) || plan.pricing.monthlyUsd;

    // Check if contract-only with no approved pricing
    if (!monthlyRate && plan.pricing.isContractOnly && !process.env.STRIPE_ALLOW_TEST_PRICING) {
      throw new ConflictException({
        statusCode: 409,
        error: 'PLAN_IS_CONTRACT_ONLY',
        message: `Plan tier '${plan.displayName}' is currently contract-only. The price book (ADR-06) is not yet approved. Please contact enterprise sales for a custom quote.`,
      });
    }

    // Default reference rate if test pricing is permitted
    const finalMonthlyRate =
      monthlyRate ||
      (dto.planTier === 'SHIELD_ESSENTIAL'
        ? 2000
        : dto.planTier === 'SHIELD_PROFESSIONAL'
          ? 4000
          : 8000);

    const quantity = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;
    const totalAmount =
      (dto.billingPeriod === 'ANNUAL' ? finalMonthlyRate * 12 : finalMonthlyRate) *
      quantity;
    const currency = (dto.currency || plan.pricing.currency || 'USD').toUpperCase();

    const appBaseUrl =
      process.env.APP_BASE_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000';

    const successUrl =
      dto.successUrl ||
      `${appBaseUrl}/pricing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      dto.cancelUrl ||
      `${appBaseUrl}/pricing/cancelled?session_id={CHECKOUT_SESSION_ID}`;

    const sessionResult = await this.stripePaymentProvider.createCheckoutSession({
      tenantId,
      userId,
      userEmail,
      planTier: dto.planTier,
      billingPeriod: dto.billingPeriod,
      amount: totalAmount,
      currency,
      successUrl,
      cancelUrl,
      metadata: {
        organizationName: tenantId,
      },
    });

    const sessionRecord = {
      sessionId: sessionResult.sessionId,
      tenantId,
      planTier: dto.planTier,
      billingPeriod: dto.billingPeriod,
      quantity,
      amount: totalAmount,
      currency,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.checkoutSessions.set(sessionResult.sessionId, sessionRecord);

    return {
      sessionId: sessionResult.sessionId,
      checkoutUrl: sessionResult.checkoutUrl,
      orderSummary: {
        planTier: dto.planTier,
        displayName: plan.displayName,
        billingPeriod: dto.billingPeriod,
        unitMonthlyRate: finalMonthlyRate,
        quantity,
        totalAmount,
        currency,
        includedOffers: plan.includedOffers,
      },
    };
  }

  /**
   * Retrieves authoritative status for a checkout session.
   */
  async getCheckoutSessionStatus(sessionId: string) {
    const record = this.checkoutSessions.get(sessionId);
    if (record) {
      return record;
    }
    return {
      sessionId,
      status: 'PENDING',
      message: 'Checkout session is pending or awaiting webhook confirmation.',
    };
  }

  /**
   * Processes verified Stripe webhook events idempotently and sends transactional emails.
   */
  async handleStripeWebhook(payload: string | Buffer, signature: string) {
    const rawString =
      typeof payload === 'string'
        ? payload
        : Buffer.isBuffer(payload)
          ? payload.toString('utf-8')
          : JSON.stringify(payload);

    if (!this.stripePaymentProvider.verifyWebhookSignature(rawString, signature)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVALID_STRIPE_WEBHOOK_SIGNATURE',
        message: 'Stripe webhook signature cryptographic verification failed',
      });
    }

    const event = this.stripePaymentProvider.constructEvent(payload, signature);
    if (!event) {
      throw new BadRequestException('Malformed webhook payload');
    }

    const key = `stripe-evt-${event.id}`;
    return this.idempotencyService.run(
      {
        key,
        operation: 'payments.stripe_webhook',
        requestPayload: { id: event.id, type: event.type },
      },
      async () => {
        this.logger.log(
          `Processing verified Stripe webhook event: ${event.type} [${event.id}]`,
        );

        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as any;
            const tenantId =
              session.metadata?.tenantId ||
              session.client_reference_id ||
              'unknown-tenant';
            const planTier =
              session.metadata?.planTier || 'SHIELD_PROFESSIONAL';
            const amount = (session.amount_total || 0) / 100;
            const currency = (session.currency || 'usd').toUpperCase();
            const customerEmail =
              session.customer_details?.email ||
              session.customer_email ||
              'customer@example.com';
            const customerName =
              session.customer_details?.name ||
              customerEmail.split('@')[0] ||
              'Valued Customer';

            this.checkoutSessions.set(session.id, {
              sessionId: session.id,
              status: 'SUCCEEDED',
              tenantId,
              planTier,
              amount,
              currency,
              paymentIntentId: session.payment_intent,
              createdAt: new Date().toISOString(),
            });

            // Grant entitlements based on the selected plan
            const plan = DRAFT_PLAN_TIERS.find((p) => p.key === planTier);
            const includedOffers = plan?.includedOffers || [
              'CONTINUOUS_ASSURANCE',
              'MANAGED_DEFENSE',
            ];

            if (this.prisma && tenantId && tenantId !== 'unknown-tenant') {
              try {
                await this.prisma.$transaction(async (tx) => {
                  for (const offer of includedOffers) {
                    await tx.entitlement.upsert({
                      where: {
                        tenant_id_offer_type: {
                          tenant_id: tenantId,
                          offer_type: offer,
                        },
                      },
                      update: { status: 'ACTIVE' },
                      create: {
                        tenant_id: tenantId,
                        offer_type: offer,
                        source_type: 'ACCEPTED_ORDER',
                        source_id: session.id,
                        status: 'ACTIVE',
                      },
                    });
                  }
                });
              } catch (entErr: any) {
                this.logger.warn(
                  `Entitlement grant fallback during checkout: ${entErr.message}`,
                );
              }
            }

            // Send Subscription Activated Email (ZS-EML-BILL-001)
            if (this.emailService) {
              try {
                await this.emailService.dispatchTransactionalEmail({
                  tenantId,
                  templateKey: 'ZS-EML-BILL-001',
                  recipients: [{ email: customerEmail, name: customerName }],
                  variables: {
                    organizationName: session.metadata?.organizationName || 'Enterprise Tenant',
                    referenceId: `sub-${session.id.substring(0, 8)}`,
                    statusLabel: 'SUBSCRIPTION_ACTIVATED',
                    plan_tier: planTier,
                    amount: `${currency} ${amount.toFixed(2)}`,
                    occurredAtLocal: new Date().toISOString(),
                  },
                  idempotencyKey: `email-sub-${session.id}`,
                });

                // Send Payment Receipt Email (ZS-EML-BILL-006)
                await this.emailService.dispatchTransactionalEmail({
                  tenantId,
                  templateKey: 'ZS-EML-BILL-006',
                  recipients: [{ email: customerEmail, name: customerName }],
                  variables: {
                    organizationName: session.metadata?.organizationName || 'Enterprise Tenant',
                    referenceId: `rcpt-${String(session.payment_intent || session.id).substring(0, 10)}`,
                    statusLabel: 'PAYMENT_RECEIVED',
                    amount: `${currency} ${amount.toFixed(2)}`,
                    occurredAtLocal: new Date().toISOString(),
                  },
                  idempotencyKey: `email-rcpt-${session.id}`,
                });
              } catch (mailErr: any) {
                this.logger.error(
                  `Failed to dispatch checkout transactional emails: ${mailErr.message}`,
                );
              }
            }

            return {
              statusCode: 200,
              body: { received: true, event: event.type },
            };
          }

          case 'payment_intent.payment_failed':
          case 'invoice.payment_failed': {
            const paymentIntent = event.data.object as any;
            const customerEmail =
              paymentIntent.receipt_email ||
              paymentIntent.customer_email ||
              'billing@example.com';
            const amount = (paymentIntent.amount || 0) / 100;
            const currency = (paymentIntent.currency || 'usd').toUpperCase();
            const tenantId = paymentIntent.metadata?.tenantId || 'platform';

            if (this.emailService) {
              try {
                await this.emailService.dispatchTransactionalEmail({
                  tenantId,
                  templateKey: 'ZS-EML-BILL-007',
                  recipients: [{ email: customerEmail }],
                  variables: {
                    organizationName: 'Enterprise Tenant',
                    referenceId: `fail-${paymentIntent.id.substring(0, 8)}`,
                    statusLabel: 'PAYMENT_FAILED',
                    amount: `${currency} ${amount.toFixed(2)}`,
                    occurredAtLocal: new Date().toISOString(),
                  },
                  idempotencyKey: `email-fail-${event.id}`,
                });
              } catch (err: any) {
                this.logger.error(
                  `Failed to send payment failure email: ${err.message}`,
                );
              }
            }
            return {
              statusCode: 200,
              body: { received: true, event: event.type },
            };
          }

          case 'charge.refunded': {
            const charge = event.data.object as any;
            const customerEmail =
              charge.receipt_email || 'billing@example.com';
            const amount = (charge.amount_refunded || 0) / 100;
            const currency = (charge.currency || 'usd').toUpperCase();
            const tenantId = charge.metadata?.tenantId || 'platform';

            if (this.emailService) {
              try {
                await this.emailService.dispatchTransactionalEmail({
                  tenantId,
                  templateKey: 'ZS-EML-BILL-010',
                  recipients: [{ email: customerEmail }],
                  variables: {
                    organizationName: 'Enterprise Tenant',
                    referenceId: `ref-${charge.id.substring(0, 8)}`,
                    statusLabel: 'REFUND_COMPLETED',
                    amount: `${currency} ${amount.toFixed(2)}`,
                    occurredAtLocal: new Date().toISOString(),
                  },
                  idempotencyKey: `email-refund-${event.id}`,
                });
              } catch (err: any) {
                this.logger.error(
                  `Failed to send refund email: ${err.message}`,
                );
              }
            }
            return {
              statusCode: 200,
              body: { received: true, event: event.type },
            };
          }

          case 'customer.subscription.deleted': {
            const sub = event.data.object as any;
            const tenantId = sub.metadata?.tenantId || 'platform';
            const customerEmail =
              sub.customer_email || 'billing@example.com';

            if (this.emailService) {
              try {
                await this.emailService.dispatchTransactionalEmail({
                  tenantId,
                  templateKey: 'ZS-EML-BILL-015',
                  recipients: [{ email: customerEmail }],
                  variables: {
                    organizationName: 'Enterprise Tenant',
                    referenceId: `cancel-${sub.id.substring(0, 8)}`,
                    statusLabel: 'SUBSCRIPTION_CANCELLED',
                    occurredAtLocal: new Date().toISOString(),
                  },
                  idempotencyKey: `email-cancel-${event.id}`,
                });
              } catch (err: any) {
                this.logger.error(
                  `Failed to send subscription cancelled email: ${err.message}`,
                );
              }
            }
            return {
              statusCode: 200,
              body: { received: true, event: event.type },
            };
          }

          default:
            return {
              statusCode: 200,
              body: { received: true, ignored: true },
            };
        }
      },
    );
  }
}
