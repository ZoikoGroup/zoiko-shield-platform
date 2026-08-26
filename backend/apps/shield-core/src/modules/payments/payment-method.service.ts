import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class AddPaymentMethodDto {
  commercialAccountId!: string;
  type!: 'CARD' | 'ACH_DEBIT' | 'SEPA_DEBIT' | 'BANK_TRANSFER';
  provider!: 'STRIPE' | 'ADYEN' | 'MANUAL';
  providerPaymentMethodRef!: string;
  lastFour?: string;
  cardBrand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isPrimary?: boolean;
  billingDetails?: Record<string, unknown>;
}

export class AccountingHandoffExportDto {
  periodKey!: string;
  exportFormat!: 'CSV' | 'JSON' | 'QUICKBOOKS_IIF' | 'NETSUITE_CSV';
}

@Injectable()
export class PaymentMethodService {
  constructor(private readonly prisma: PrismaService) {}

  async addPaymentMethod(
    tenantId: string,
    dto: AddPaymentMethodDto,
    actorId: string,
  ) {
    if (!dto.commercialAccountId || !dto.providerPaymentMethodRef) {
      throw new BadRequestException(
        'commercialAccountId and providerPaymentMethodRef are required',
      );
    }

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'payment_method.added',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `pm-add-${dto.commercialAccountId}-${Date.now()}`,
        payload: JSON.stringify({
          commercialAccountId: dto.commercialAccountId,
          type: dto.type,
          provider: dto.provider,
          providerPaymentMethodRef: dto.providerPaymentMethodRef,
          lastFour: dto.lastFour,
          cardBrand: dto.cardBrand,
          expiryMonth: dto.expiryMonth,
          expiryYear: dto.expiryYear,
          isPrimary: dto.isPrimary ?? true,
          billingDetails: dto.billingDetails,
        }),
      },
    });

    return {
      paymentMethodId: event.id,
      tenantId,
      commercialAccountId: dto.commercialAccountId,
      type: dto.type,
      provider: dto.provider,
      lastFour: dto.lastFour,
      isPrimary: dto.isPrimary ?? true,
      status: 'ACTIVE',
      addedAt: event.created_at,
    };
  }

  async listPaymentMethods(tenantId: string, commercialAccountId: string) {
    const events = await this.prisma.commercialEvent.findMany({
      where: {
        tenant_id: tenantId,
        event_type: 'payment_method.added',
      },
      orderBy: { created_at: 'desc' },
    });

    const methods: any[] = [];
    for (const e of events) {
      try {
        const payload = JSON.parse(e.payload);
        if (payload.commercialAccountId === commercialAccountId) {
          methods.push({ id: e.id, addedAt: e.created_at, ...payload });
        }
      } catch {
        // ignore invalid JSON payload
      }
    }

    return methods;
  }

  async exportAccountingHandoff(
    tenantId: string,
    dto: AccountingHandoffExportDto,
    actorId: string,
  ) {
    const invoices = await this.prisma.commercialInvoice.findMany({
      where: { status: { in: ['ISSUED', 'PAID'] } },
      include: { lines: true },
      take: 100,
    });

    const handoffLines = invoices.map((inv) => ({
      invoiceId: inv.id,
      issueDate: inv.issued_at,
      totalAmount: inv.total_amount,
      currency: inv.currency,
      status: inv.status,
      revenueAccountCode: '4000-SAAS-SUBSCRIPTION',
      taxAccountCode: '2200-SALES-TAX-PAYABLE',
      arAccountCode: '1200-ACCOUNTS-RECEIVABLE',
    }));

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'accounting.handoff_exported',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `acct-handoff-${dto.periodKey}-${Date.now()}`,
        payload: JSON.stringify({
          periodKey: dto.periodKey,
          format: dto.exportFormat,
          totalInvoicesExported: invoices.length,
          exportedAt: new Date().toISOString(),
        }),
      },
    });

    return {
      exportBatchId: event.id,
      periodKey: dto.periodKey,
      format: dto.exportFormat,
      invoiceCount: invoices.length,
      handoffData: handoffLines,
      exportedAt: event.created_at,
      exportedBy: actorId,
    };
  }

  getSellerMerchantConfig() {
    return {
      sellerLegalEntity: 'Zoiko Tech Inc.',
      taxId: 'US-983421049',
      merchantAccounts: [
        {
          provider: 'STRIPE',
          accountId: 'acct_1ZoikoShieldProd',
          region: 'US/GLOBAL',
        },
        {
          provider: 'ADYEN',
          merchantAccount: 'ZoikoTechECOM',
          region: 'EU/UK',
        },
      ],
      defaultCurrency: 'USD',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    };
  }
}
