import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { IsArray, IsISO8601, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxRuleService } from '../tax/tax-rule.service';
import { NON_COMMERCIAL_CLASSIFICATIONS } from '../commercial/commercial-entitlement.service';

export class CreateDraftInvoiceDto {
  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  contractId!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsArray()
  lineItems!: Array<{ sku: string; amount: number; description: string }>;
}

export class AddInvoiceLineDto {
  @IsString()
  sku!: string;

  @IsUUID()
  contractId!: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsISO8601()
  servicePeriodStart!: Date;

  @IsISO8601()
  servicePeriodEnd!: Date;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @IsString()
  jurisdiction!: string;

  @IsString()
  productTaxClass!: string;
}

export class RecordFxRateDto {
  @IsNumber()
  fxRate!: number;

  @IsString()
  fxSource!: string;
}

@Injectable()
export class InvoiceSkeletonService {
  private readonly logger = new Logger(InvoiceSkeletonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxRuleService: TaxRuleService,
  ) {}

  /**
   * Create draft invoice
   */
  async createDraftInvoice(dto: CreateDraftInvoiceDto) {
    const totalAmount = dto.lineItems.reduce((sum, item) => sum + item.amount, 0);

    return this.prisma.commercialInvoice.create({
      data: {
        commercial_account_id: dto.commercialAccountId,
        contract_id: dto.contractId,
        currency: dto.currency || 'USD',
        total_amount: totalAmount,
        status: 'DRAFT',
        immutable_snapshot: JSON.stringify(dto.lineItems),
      },
    });
  }

  /**
   * Part 10/12: add a structured invoice line with tax resolved and
   * frozen at add-time. Fail-closed — no approved tax rule blocks the
   * line (and therefore the invoice) from being created, never invents
   * a rate. Only permitted while the invoice is still DRAFT.
   */
  async addInvoiceLine(invoiceId: string, dto: AddInvoiceLineDto) {
    const invoice = await this.prisma.commercialInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'DRAFT') {
      throw new ConflictException(`Invoice '${invoiceId}' is '${invoice.status}', not DRAFT`);
    }

    const discountPercent = dto.discountPercent || 0;
    const taxableAmount = dto.quantity * dto.unitPrice * (1 - discountPercent / 100);

    const taxResult = await this.taxRuleService.resolveTax(dto.jurisdiction, dto.productTaxClass, taxableAmount);
    if (!taxResult) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_TAX_RULE',
        message: `No approved tax rule for jurisdiction '${dto.jurisdiction}' / class '${dto.productTaxClass}' — invoice line cannot be added without an invented rate`,
      });
    }

    return this.prisma.commercialInvoiceLine.create({
      data: {
        invoice_id: invoiceId,
        sku: dto.sku,
        contract_id: dto.contractId,
        subscription_id: dto.subscriptionId,
        service_period_start: dto.servicePeriodStart,
        service_period_end: dto.servicePeriodEnd,
        quantity: dto.quantity,
        unit_price: dto.unitPrice,
        discount_percent: discountPercent,
        tax_amount: taxResult.taxAmount,
        tax_rule_id: taxResult.ruleId,
        currency: invoice.currency,
      },
    });
  }

  /** Part 11: FX is recorded, never used to rewrite the transaction currency values. */
  async recordFxRate(invoiceId: string, dto: RecordFxRateDto) {
    const invoice = await this.prisma.commercialInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'DRAFT') {
      throw new ConflictException(`Invoice '${invoiceId}' is '${invoice.status}', not DRAFT`);
    }

    return this.prisma.commercialInvoice.update({
      where: { id: invoiceId },
      data: { fx_rate: dto.fxRate, fx_source: dto.fxSource, fx_effective_at: new Date() },
    });
  }

  /**
   * Issue invoice (FIN-02: freezes line items and locks invoice).
   * Part 10: if the invoice uses structured lines, every line must
   * already carry a resolved tax_rule_id — issuance fails closed
   * otherwise rather than issuing with untaxed lines.
   * COM-03: non-commercial accounts (INTERNAL/DEMO/SANDBOX/PILOT/
   * EVALUATION) are exempt from production-readiness field checks
   * elsewhere in the CPQ chain precisely so they can never accidentally
   * become billable — enforced here, at the one point a draft becomes a
   * real, immutable, payable invoice.
   */
  async issueInvoice(invoiceId: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
      include: { lines: true, commercialAccount: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }

    if (NON_COMMERCIAL_CLASSIFICATIONS.includes(invoice.commercialAccount.billing_classification)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NON_COMMERCIAL_ACCOUNT_CANNOT_BE_INVOICED',
        message: `Commercial account '${invoice.commercial_account_id}' has non-commercial classification '${invoice.commercialAccount.billing_classification}' and cannot receive a live invoice`,
      });
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'APPROVAL_PENDING') {
      throw new ConflictException(`Invoice '${invoiceId}' is in status '${invoice.status}' and cannot be re-issued (FIN-02 immutability rule)`);
    }

    const unresolvedLine = (invoice.lines || []).find((l) => !l.tax_rule_id);
    if (unresolvedLine) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_LINE_TAX_UNRESOLVED',
        message: `Invoice line '${unresolvedLine.id}' has no resolved tax rule; invoice cannot be issued`,
      });
    }

    return this.prisma.commercialInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'ISSUED',
        issued_at: new Date(),
      },
    });
  }

  /**
   * Part 12: corrections to an ISSUED invoice are append-only credit/debit
   * notes — the original issued invoice row is never mutated.
   */
  async issueCreditNote(invoiceId: string, amount: number, reason: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'ISSUED') {
      throw new ConflictException(`Credit notes can only be issued against an ISSUED invoice, '${invoiceId}' is '${invoice.status}'`);
    }

    return this.prisma.commercialCreditNote.create({
      data: { invoice_id: invoiceId, amount, currency: invoice.currency, reason, status: 'ISSUED', issued_at: new Date() },
    });
  }

  async issueDebitNote(invoiceId: string, amount: number, reason: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'ISSUED') {
      throw new ConflictException(`Debit notes can only be issued against an ISSUED invoice, '${invoiceId}' is '${invoice.status}'`);
    }

    return this.prisma.commercialDebitNote.create({
      data: { invoice_id: invoiceId, amount, currency: invoice.currency, reason, status: 'ISSUED', issued_at: new Date() },
    });
  }

  /**
   * Get invoices for commercial account
   */
  async getInvoicesByAccount(commercialAccountId: string) {
    return this.prisma.commercialInvoice.findMany({
      where: { commercial_account_id: commercialAccountId },
      orderBy: { created_at: 'desc' },
    });
  }
}
