import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { NON_COMMERCIAL_CLASSIFICATIONS } from '../commercial/commercial-entitlement.service';
import { assertTransition } from '../commerce/state-machine.util';

/**
 * ZS-COM-BILL-001 Part 20 / Part 2 quote state machine.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED', 'EXPIRED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['CONVERTED', 'EXPIRED', 'CANCELLED'],
  REJECTED: [],
  EXPIRED: [],
  CONVERTED: [],
  CANCELLED: [],
};

export class QuoteLineInput {
  @IsString()
  sku!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;
}

export class CreateQuoteDto {
  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  catalogVersionId!: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  termMonths?: number;

  @IsString()
  requestedBy!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineInput)
  lines!: QuoteLineInput[];
}

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly approvalService: CommercialApprovalService,
    private readonly killSwitchService: CommercialKillSwitchService,
  ) {}

  /**
   * ZS-COM-BILL-001 A: production commercial accounts must carry a legal
   * entity, region and billing classification before they can be quoted.
   * Non-commercial classifications (INTERNAL/DEMO/SANDBOX) are exempt so
   * they can never accidentally start generating live commercial records.
   */
  private async assertProductionReadyAccount(commercialAccountId: string) {
    const account = await this.prisma.commercialAccount.findUnique({
      where: { id: commercialAccountId },
    });
    if (!account) {
      throw new NotFoundException(`Commercial account '${commercialAccountId}' not found`);
    }

    if (NON_COMMERCIAL_CLASSIFICATIONS.includes(account.billing_classification)) {
      return account;
    }

    const missing: string[] = [];
    if (!account.legal_entity_id) missing.push('legalEntityId');
    if (!account.region) missing.push('region');
    if (!account.billing_classification) missing.push('billingClassification');
    if (!account.billing_source) missing.push('billingSource');

    if (missing.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'COMMERCIAL_ACCOUNT_NOT_PRODUCTION_READY',
        message: `Commercial account '${commercialAccountId}' is missing required fields for a live quote: ${missing.join(', ')}`,
      });
    }

    return account;
  }

  async createQuote(dto: CreateQuoteDto) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new ConflictException('A quote requires at least one line');
    }

    await this.assertProductionReadyAccount(dto.commercialAccountId);

    const catalogVersion = await this.prisma.catalogVersion.findUnique({
      where: { id: dto.catalogVersionId },
    });
    if (!catalogVersion || catalogVersion.status !== 'APPROVED') {
      throw new ConflictException({
        statusCode: 409,
        error: 'CATALOG_VERSION_NOT_APPROVED',
        message: `Catalog version '${dto.catalogVersionId}' is not APPROVED; a quote cannot be built from a draft catalog`,
      });
    }

    const region = dto.region || 'GLOBAL';
    const currency = dto.currency || 'USD';

    const resolvedLines: Array<{
      sku: string;
      quantity: number;
      productId: string;
      priceBookId: string;
      unitPrice: number;
      discountPercent: number;
    }> = [];

    for (const line of dto.lines) {
      const priceBook = await this.catalogService.getActivePriceBook(line.sku, region, currency);
      if (!priceBook) {
        throw new ConflictException({
          statusCode: 409,
          error: 'NO_APPROVED_PRICE_BOOK',
          message: `No approved, effective price book for SKU '${line.sku}' in ${region}/${currency}`,
        });
      }
      resolvedLines.push({
        sku: line.sku,
        quantity: line.quantity,
        productId: priceBook.product_id,
        priceBookId: priceBook.id,
        unitPrice: priceBook.unit_price,
        discountPercent: line.discountPercent || 0,
      });
    }

    const requiresApproval = resolvedLines.some((l) => l.discountPercent > 0);

    const quote = await this.prisma.commercialQuote.create({
      data: {
        commercial_account_id: dto.commercialAccountId,
        catalog_version_id: dto.catalogVersionId,
        status: 'DRAFT',
        currency,
        region,
        term_months: dto.termMonths || 12,
        requires_approval: requiresApproval,
        requested_by: dto.requestedBy,
        // Frozen point-in-time snapshot: approval/conversion must never
        // re-read live catalog data to reinterpret this quote later.
        snapshot: JSON.stringify({ catalogVersionId: dto.catalogVersionId, lines: resolvedLines }),
        lines: {
          create: resolvedLines.map((l) => ({
            product_id: l.productId,
            price_book_id: l.priceBookId,
            quantity: l.quantity,
            unit_price: l.unitPrice,
            line_discount_percent: l.discountPercent,
          })),
        },
      },
      include: { lines: true },
    });

    return quote;
  }

  /**
   * Part 9: expiry is enforced dynamically on every read/mutation, not only
   * by a background sweeper — a non-terminal quote past its expires_at is
   * flipped to EXPIRED in place before the caller sees or acts on it, so
   * every subsequent mutation (submit/approve/etc.) fails via the ordinary
   * state-machine guard rather than needing its own expiry check.
   */
  async getQuoteById(quoteId: string) {
    let quote = await this.prisma.commercialQuote.findUnique({
      where: { id: quoteId },
      include: { lines: true },
    });
    if (!quote) {
      throw new NotFoundException(`Quote '${quoteId}' not found`);
    }

    const nonTerminal = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];
    if (nonTerminal.includes(quote.status) && quote.expires_at && quote.expires_at < new Date()) {
      quote = await this.prisma.commercialQuote.update({
        where: { id: quoteId },
        data: { status: 'EXPIRED' },
        include: { lines: true },
      });
    }

    return quote;
  }

  async submitForApproval(quoteId: string, actor: string) {
    const quote = await this.getQuoteById(quoteId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'PENDING_APPROVAL', 'quote');

    if (quote.requires_approval) {
      const approval = await this.approvalService.requestApproval({
        changeType: 'NON_STANDARD_DISCOUNT',
        objectType: 'CommercialQuote',
        objectId: quoteId,
        requestedBy: actor,
        reason: `Quote ${quoteId} contains a non-standard line discount`,
        proposedSnapshot: JSON.parse(quote.snapshot),
      });
      return this.prisma.commercialQuote.update({
        where: { id: quoteId },
        data: { status: 'PENDING_APPROVAL', approval_id: approval.id },
      });
    }

    return this.prisma.commercialQuote.update({
      where: { id: quoteId },
      data: { status: 'PENDING_APPROVAL' },
    });
  }

  /**
   * Approves a quote. If the quote required maker-checker approval, the
   * linked CommercialApproval must already be in APPROVED status (decided
   * via CommercialApprovalService.decideApproval by a different actor).
   */
  async approveQuote(quoteId: string, approverId: string) {
    await this.killSwitchService.assertNotBlocked('QUOTE_APPROVAL');

    const quote = await this.getQuoteById(quoteId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'APPROVED', 'quote');

    if (quote.requires_approval) {
      if (!quote.approval_id) {
        throw new ConflictException('Quote requires approval but has no linked CommercialApproval');
      }
      const approval = await this.approvalService.getApprovalById(quote.approval_id);
      if (approval.status !== 'APPROVED') {
        throw new ConflictException({
          statusCode: 409,
          error: 'COMMERCIAL_APPROVAL_NOT_GRANTED',
          message: `Linked commercial approval '${quote.approval_id}' is in status '${approval.status}', not APPROVED`,
        });
      }
      await this.approvalService.markApplied(quote.approval_id);
    }

    return this.prisma.commercialQuote.update({
      where: { id: quoteId },
      data: { status: 'APPROVED', approved_by: approverId, approved_at: new Date() },
    });
  }

  async rejectQuote(quoteId: string, reason: string) {
    const quote = await this.getQuoteById(quoteId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'REJECTED', 'quote');
    return this.prisma.commercialQuote.update({
      where: { id: quoteId },
      data: { status: 'REJECTED', rejected_reason: reason },
    });
  }

  async cancelQuote(quoteId: string) {
    const quote = await this.getQuoteById(quoteId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'CANCELLED', 'quote');
    return this.prisma.commercialQuote.update({ where: { id: quoteId }, data: { status: 'CANCELLED' } });
  }

  /** Called by OrderService once an order has been created from this quote. */
  async markConverted(quoteId: string) {
    const quote = await this.getQuoteById(quoteId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'CONVERTED', 'quote');
    return this.prisma.commercialQuote.update({ where: { id: quoteId }, data: { status: 'CONVERTED' } });
  }
}
