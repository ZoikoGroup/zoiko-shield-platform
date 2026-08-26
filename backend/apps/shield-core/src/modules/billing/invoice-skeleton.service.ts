import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxRuleService } from '../tax/tax-rule.service';
import { NON_COMMERCIAL_CLASSIFICATIONS } from '../commercial/commercial-account.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';

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

export class InvoiceBasisSourceDto {
  @IsIn([
    'ENTITLEMENT',
    'SERVICE_OBLIGATION',
    'METER_SNAPSHOT',
    'CONTRACT_COMMITMENT',
  ])
  basisType!:
    | 'ENTITLEMENT'
    | 'SERVICE_OBLIGATION'
    | 'METER_SNAPSHOT'
    | 'CONTRACT_COMMITMENT';

  @IsUUID()
  sourceId!: string;
}

export class AddInvoiceLineDto {
  @IsString()
  sku!: string;

  @IsUUID()
  contractId!: string;

  @IsUUID()
  orderLineId!: string;

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

  @IsOptional()
  @IsIn(['SEPARATE', 'AGGREGATED'])
  presentationMode?: 'SEPARATE' | 'AGGREGATED';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceTraceSourceDto)
  traceSources?: InvoiceTraceSourceDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceBasisSourceDto)
  basisSources!: InvoiceBasisSourceDto[];
}

export class InvoiceTraceSourceDto {
  @IsUUID()
  orderLineId!: string;

  @IsNumber()
  @Min(0)
  allocatedAmount!: number;
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
    private readonly killSwitchService: CommercialKillSwitchService,
  ) {}

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Create draft invoice
   */
  async createDraftInvoice(dto: CreateDraftInvoiceDto) {
    const totalAmount = dto.lineItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

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
    await this.killSwitchService.assertNotBlocked('USAGE_BILLING_EXPORT');

    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'DRAFT') {
      throw new ConflictException(
        `Invoice '${invoiceId}' is '${invoice.status}', not DRAFT`,
      );
    }
    if (invoice.contract_id !== dto.contractId) {
      throw new ConflictException(
        `Invoice '${invoiceId}' belongs to contract '${invoice.contract_id}', not '${dto.contractId}'`,
      );
    }
    const periodStart = new Date(dto.servicePeriodStart);
    const periodEnd = new Date(dto.servicePeriodEnd);
    if (periodEnd <= periodStart) {
      throw new ConflictException(
        'servicePeriodEnd must follow servicePeriodStart',
      );
    }

    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
    });
    if (
      !contract ||
      contract.status !== 'ACTIVE' ||
      contract.commercial_account_id !== invoice.commercial_account_id ||
      periodStart < contract.term_start ||
      periodEnd > contract.term_end
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_CONTRACT_BASIS_INVALID',
        message:
          'Invoice lines require the matching ACTIVE customer contract and a service period within its term',
      });
    }

    const orderLine = await this.prisma.commercialOrderLine.findUnique({
      where: { id: dto.orderLineId },
      include: {
        product: true,
        order: { include: { quote: { include: { lines: true } } } },
      },
    });
    const effectiveSku = orderLine?.catalog_sku || orderLine?.product?.sku;
    if (
      !orderLine ||
      orderLine.line_type !== 'CUSTOMER' ||
      !orderLine.billable ||
      orderLine.order.status !== 'PROVISIONED' ||
      orderLine.order.contract_id !== dto.contractId ||
      orderLine.order.commercial_account_id !== invoice.commercial_account_id ||
      orderLine.currency !== invoice.currency ||
      effectiveSku !== dto.sku
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_ORDER_LINE_BASIS_INVALID',
        message:
          'Invoice line must reference the matching provisioned, billable customer order line, SKU, contract and currency',
      });
    }

    const quoteLine = orderLine.order.quote.lines.find(
      (line) => line.product_id === orderLine.product_id,
    );
    if (
      orderLine.order.quote.status !== 'APPROVED' ||
      !quoteLine ||
      Number(quoteLine.unit_price) !== Number(orderLine.list_unit_price) ||
      Number(quoteLine.line_discount_percent) !==
        Number(orderLine.discount_percent)
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_FROZEN_QUOTE_BASIS_INVALID',
        message:
          'The provisioned order line no longer reconciles to its approved frozen quote',
      });
    }

    const priceBook = await this.prisma.priceBook.findUnique({
      where: { id: quoteLine.price_book_id },
    });
    if (
      !priceBook ||
      priceBook.status !== 'APPROVED' ||
      priceBook.product_id !== orderLine.product_id ||
      priceBook.catalog_version_id !==
        orderLine.order.quote.catalog_version_id ||
      priceBook.currency !== invoice.currency ||
      (priceBook.commercial_account_id &&
        priceBook.commercial_account_id !== invoice.commercial_account_id) ||
      Number(priceBook.unit_price) !== Number(orderLine.list_unit_price)
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_PRICE_BOOK_BASIS_INVALID',
        message:
          'Invoice line requires the approved price book frozen into the accepted quote',
      });
    }

    const discountPercent = dto.discountPercent ?? 0;
    if (
      Number(dto.unitPrice) !== Number(orderLine.list_unit_price) ||
      Number(discountPercent) !== Number(orderLine.discount_percent)
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_PRICE_MISMATCH',
        message:
          'Invoice unit price and discount must match the approved order-line economics',
      });
    }

    if (dto.subscriptionId) {
      const subscription = await this.prisma.commercialSubscription.findFirst({
        where: {
          id: dto.subscriptionId,
          order_id: orderLine.order_id,
          commercial_account_id: invoice.commercial_account_id,
          contract_id: dto.contractId,
          status: 'ACTIVE',
          effective_from: { lte: periodStart },
          OR: [{ effective_to: null }, { effective_to: { gte: periodEnd } }],
        },
      });
      if (!subscription) {
        throw new ConflictException({
          statusCode: 409,
          error: 'INVOICE_SUBSCRIPTION_BASIS_INVALID',
          message:
            'Referenced subscription must be ACTIVE under the same order, account and contract for the service period',
        });
      }
    }

    if (
      !dto.basisSources?.length ||
      new Set(
        dto.basisSources.map(
          (source) => `${source.basisType}:${source.sourceId}`,
        ),
      ).size !== dto.basisSources.length
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_BASIS_REQUIRED',
        message:
          'Each invoice line requires one or more unique entitlement, service-obligation, accepted-usage meter snapshot or contract-commitment bases',
      });
    }

    const bases: Prisma.CommercialInvoiceLineBasisUncheckedCreateWithoutInvoiceLineInput[] =
      [];
    let meterQuantity = 0;
    let hasMeterBasis = false;
    for (const source of dto.basisSources) {
      if (source.basisType === 'ENTITLEMENT') {
        const entitlement = await this.prisma.entitlement.findFirst({
          where: {
            id: source.sourceId,
            commercial_account_id: invoice.commercial_account_id,
            status: 'ACTIVE',
            effective_from: { lte: periodStart },
            OR: [{ effective_to: null }, { effective_to: { gte: periodEnd } }],
          },
        });
        if (!entitlement) {
          throw new ConflictException({
            statusCode: 409,
            error: 'INVOICE_ENTITLEMENT_BASIS_INVALID',
            message: `Entitlement '${source.sourceId}' is not ACTIVE for this account and service period`,
          });
        }
        const snapshot = JSON.stringify({
          id: entitlement.id,
          commercialAccountId: entitlement.commercial_account_id,
          tenantId: entitlement.tenant_id,
          offerType: entitlement.offer_type,
          sourceType: entitlement.source_type,
          sourceId: entitlement.source_id,
          status: entitlement.status,
          effectiveFrom: entitlement.effective_from,
          effectiveTo: entitlement.effective_to,
        });
        bases.push({
          basis_type: source.basisType,
          source_id: entitlement.id,
          entitlement_id: entitlement.id,
          source_status: entitlement.status,
          source_version: 'v1',
          quantity: dto.quantity,
          unit: 'ENTITLEMENT',
          service_period_start: periodStart,
          service_period_end: periodEnd,
          source_snapshot: snapshot,
          source_snapshot_hash: this.sha256(snapshot),
        });
        continue;
      }

      if (source.basisType === 'SERVICE_OBLIGATION') {
        const obligation = await this.prisma.serviceObligation.findFirst({
          where: { id: source.sourceId, contract_id: dto.contractId },
        });
        if (
          !obligation ||
          ['CANCELLED', 'WAIVED'].includes(obligation.status)
        ) {
          throw new ConflictException({
            statusCode: 409,
            error: 'INVOICE_SERVICE_OBLIGATION_BASIS_INVALID',
            message: `Service obligation '${source.sourceId}' is unavailable or no longer billable`,
          });
        }
        const snapshot = JSON.stringify({
          id: obligation.id,
          contractId: obligation.contract_id,
          tenantId: obligation.tenant_id,
          environmentId: obligation.environment_id,
          obligationKey: obligation.obligation_key,
          obligationType: obligation.obligation_type,
          obligationScope: obligation.obligation_scope,
          coverageWindow: obligation.coverage_window,
          responseAuthority: obligation.response_authority,
          customerDependencies: obligation.customer_dependencies,
          exclusions: obligation.exclusions,
          claimEligibility: obligation.claim_eligibility,
          claimEligibilityReason: obligation.claim_eligibility_reason,
          status: obligation.status,
          dueAt: obligation.due_at,
          deliveredAt: obligation.delivered_at,
          evidenceRef: obligation.evidence_ref,
        });
        bases.push({
          basis_type: source.basisType,
          source_id: obligation.id,
          service_obligation_id: obligation.id,
          source_status: obligation.status,
          source_version: 'v1',
          quantity: 1,
          unit: 'OBLIGATION',
          service_period_start: periodStart,
          service_period_end: periodEnd,
          source_snapshot: snapshot,
          source_snapshot_hash: this.sha256(snapshot),
        });
        continue;
      }

      if (source.basisType === 'CONTRACT_COMMITMENT') {
        const commitment =
          await this.prisma.meterAuthorizationPolicy.findFirst({
            where: {
              id: source.sourceId,
              commercial_account_id: invoice.commercial_account_id,
              contract_id: dto.contractId,
              price_book_id: priceBook.id,
              status: 'APPROVED',
              pricing_model: 'COMMITTED_CAPACITY',
              committed_quantity: { gt: 0 },
              effective_from: { lte: periodStart },
              OR: [
                { effective_to: null },
                { effective_to: { gte: periodEnd } },
              ],
            },
            include: { meterDefinition: true },
          });
        if (!commitment || !commitment.committed_quantity) {
          throw new ConflictException({
            statusCode: 409,
            error: 'INVOICE_CONTRACT_COMMITMENT_BASIS_INVALID',
            message: `Contract commitment '${source.sourceId}' must be an approved, effective COMMITTED_CAPACITY policy using this line's frozen price book`,
          });
        }
        const snapshot = JSON.stringify({
          id: commitment.id,
          commercialAccountId: commitment.commercial_account_id,
          contractId: commitment.contract_id,
          tenantId: commitment.tenant_id,
          environmentId: commitment.environment_id,
          policyKey: commitment.policy_key,
          version: commitment.version,
          pricingModel: commitment.pricing_model,
          priceBookId: commitment.price_book_id,
          meterDefinitionId: commitment.meter_definition_id,
          meterVersion: commitment.meterDefinition.version,
          unit: commitment.meterDefinition.unit,
          committedQuantity: commitment.committed_quantity,
          status: commitment.status,
          effectiveFrom: commitment.effective_from,
          effectiveTo: commitment.effective_to,
          chargeSource: 'CONTRACT_LINE_ITEM',
          syntheticUsage: false,
        });
        bases.push({
          basis_type: source.basisType,
          source_id: commitment.id,
          meter_authorization_policy_id: commitment.id,
          source_status: commitment.status,
          source_version: `policy:${commitment.version}`,
          quantity: commitment.committed_quantity,
          unit: commitment.meterDefinition.unit,
          service_period_start: periodStart,
          service_period_end: periodEnd,
          source_snapshot: snapshot,
          source_snapshot_hash: this.sha256(snapshot),
        });
        continue;
      }

      const meterExport = await this.prisma.meterBillingExport.findFirst({
        where: {
          id: source.sourceId,
          contract_id: dto.contractId,
          status: 'APPROVED',
          period_start: periodStart,
          period_end: periodEnd,
        },
      });
      if (
        !meterExport ||
        (orderLine.order.tenant_id &&
          meterExport.tenant_id !== orderLine.order.tenant_id) ||
        this.sha256(meterExport.immutable_snapshot) !== meterExport.checksum
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'INVOICE_METER_SNAPSHOT_BASIS_INVALID',
          message: `Meter export '${source.sourceId}' must be approved, checksum-valid and match this contract, tenant and exact service period`,
        });
      }
      let meterUnit = 'METER_UNIT';
      try {
        const parsed = JSON.parse(meterExport.immutable_snapshot) as {
          unit?: unknown;
        };
        if (typeof parsed.unit === 'string' && parsed.unit.trim()) {
          meterUnit = parsed.unit;
        }
      } catch {
        throw new ConflictException({
          statusCode: 409,
          error: 'INVOICE_METER_SNAPSHOT_BASIS_INVALID',
          message: `Meter export '${source.sourceId}' does not contain a valid immutable JSON snapshot`,
        });
      }
      hasMeterBasis = true;
      meterQuantity += meterExport.billable_quantity;
      bases.push({
        basis_type: source.basisType,
        source_id: meterExport.id,
        meter_billing_export_id: meterExport.id,
        source_status: meterExport.status,
        source_version: `meter:${meterExport.meter_version}`,
        quantity: meterExport.billable_quantity,
        unit: meterUnit,
        service_period_start: periodStart,
        service_period_end: periodEnd,
        source_snapshot: meterExport.immutable_snapshot,
        source_snapshot_hash: meterExport.checksum,
      });
    }

    if (hasMeterBasis && meterQuantity !== dto.quantity) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_METER_QUANTITY_MISMATCH',
        message: `Invoice quantity (${dto.quantity}) must equal approved meter billable quantity (${meterQuantity})`,
      });
    }

    const taxableAmount =
      dto.quantity * dto.unitPrice * (1 - discountPercent / 100);

    const presentationMode = dto.presentationMode ?? 'SEPARATE';
    const traceSources = dto.traceSources ?? [];
    if (presentationMode === 'AGGREGATED' && traceSources.length < 2) {
      throw new ConflictException({
        statusCode: 409,
        error: 'BUNDLE_AGGREGATION_TRACE_REQUIRED',
        message:
          'An aggregated bundle invoice line requires at least two underlying component traces',
      });
    }
    if (presentationMode === 'SEPARATE' && traceSources.length > 1) {
      throw new ConflictException(
        'A SEPARATE invoice line may trace one component only; use AGGREGATED for multiple components',
      );
    }
    if (
      new Set(traceSources.map((source) => source.orderLineId)).size !==
      traceSources.length
    ) {
      throw new ConflictException('Invoice trace sources must be unique');
    }
    const tracedAmount = traceSources.reduce(
      (sum, source) => sum + source.allocatedAmount,
      0,
    );
    if (
      traceSources.length &&
      Math.abs(tracedAmount - taxableAmount) > 0.0001
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_TRACE_AMOUNT_MISMATCH',
        message: `Trace allocations (${tracedAmount}) must equal the pre-tax invoice line amount (${taxableAmount})`,
      });
    }

    if (traceSources.length) {
      const sourceLines = await this.prisma.commercialOrderLine.findMany({
        where: { id: { in: traceSources.map((source) => source.orderLineId) } },
        include: { order: true },
      });
      if (sourceLines.length !== traceSources.length) {
        throw new ConflictException(
          'One or more invoice trace sources do not exist',
        );
      }
      const parentProductIds = new Set(
        sourceLines.map((line) => line.bundle_parent_product_id),
      );
      const invalidSource = sourceLines.find(
        (line) =>
          line.line_type !== 'BUNDLE_COMPONENT' ||
          line.billable ||
          line.projection_status !== 'EXPANDED' ||
          line.order.status !== 'PROVISIONED' ||
          line.order.contract_id !== invoice.contract_id ||
          line.currency !== invoice.currency ||
          (presentationMode === 'AGGREGATED' &&
            line.invoice_presentation !== 'AGGREGATE_ALLOWED'),
      );
      if (invalidSource || parentProductIds.size !== 1) {
        throw new ConflictException({
          statusCode: 409,
          error: 'INVALID_BUNDLE_INVOICE_TRACE',
          message:
            'Trace sources must be expanded non-billable components from one bundle under this contract/currency and must permit aggregation',
        });
      }
    }

    const taxResult = await this.taxRuleService.resolveTax(
      dto.jurisdiction,
      dto.productTaxClass,
      taxableAmount,
    );
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
        order_line_id: orderLine.id,
        price_book_id: priceBook.id,
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
        presentation_mode: presentationMode,
        representation_scope: 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION',
        bases: { create: bases },
        ...(traceSources.length
          ? {
              traces: {
                create: traceSources.map((source) => ({
                  invoice_id: invoiceId,
                  order_line_id: source.orderLineId,
                  allocated_amount: source.allocatedAmount,
                  currency: invoice.currency,
                  service_period_start: periodStart,
                  service_period_end: periodEnd,
                })),
              },
            }
          : {}),
      },
      include: { traces: true, bases: true },
    });
  }

  /** Part 11: FX is recorded, never used to rewrite the transaction currency values. */
  async recordFxRate(invoiceId: string, dto: RecordFxRateDto) {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'DRAFT') {
      throw new ConflictException(
        `Invoice '${invoiceId}' is '${invoice.status}', not DRAFT`,
      );
    }

    return this.prisma.commercialInvoice.update({
      where: { id: invoiceId },
      data: {
        fx_rate: dto.fxRate,
        fx_source: dto.fxSource,
        fx_effective_at: new Date(),
      },
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
    await this.killSwitchService.assertNotBlocked('INVOICE_FINALIZATION');

    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: { include: { traces: true, bases: true } },
        commercialAccount: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }

    if (
      NON_COMMERCIAL_CLASSIFICATIONS.includes(
        invoice.commercialAccount.billing_classification,
      )
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NON_COMMERCIAL_ACCOUNT_CANNOT_BE_INVOICED',
        message: `Commercial account '${invoice.commercial_account_id}' has non-commercial classification '${invoice.commercialAccount.billing_classification}' and cannot receive a live invoice`,
      });
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'APPROVAL_PENDING') {
      throw new ConflictException(
        `Invoice '${invoiceId}' is in status '${invoice.status}' and cannot be re-issued (FIN-02 immutability rule)`,
      );
    }

    if (!(invoice.lines || []).length) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_COMMERCIAL_BASIS_REQUIRED',
        message:
          'An invoice cannot be issued without structured commercial invoice lines',
      });
    }

    const lineWithoutCommercialBasis = (invoice.lines || []).find(
      (line) =>
        !line.order_line_id ||
        !line.price_book_id ||
        line.representation_scope !== 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION' ||
        !(line.bases || []).length,
    );
    if (lineWithoutCommercialBasis) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_LINE_COMMERCIAL_BASIS_MISSING',
        message: `Invoice line '${lineWithoutCommercialBasis.id}' has no complete order, approved-price and entitlement/service/meter basis`,
      });
    }

    const corruptedBasis = (invoice.lines || [])
      .flatMap((line) => line.bases || [])
      .find(
        (basis) =>
          this.sha256(basis.source_snapshot) !== basis.source_snapshot_hash,
      );
    if (corruptedBasis) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_BASIS_SNAPSHOT_CORRUPTED',
        message: `Invoice basis '${corruptedBasis.id}' no longer matches its frozen SHA-256 hash`,
      });
    }

    const unresolvedLine = (invoice.lines || []).find((l) => !l.tax_rule_id);
    if (unresolvedLine) {
      throw new ConflictException({
        statusCode: 409,
        error: 'INVOICE_LINE_TAX_UNRESOLVED',
        message: `Invoice line '${unresolvedLine.id}' has no resolved tax rule; invoice cannot be issued`,
      });
    }
    const untraceableAggregate = (invoice.lines || []).find((line) => {
      if (line.presentation_mode !== 'AGGREGATED') return false;
      const traces = line.traces ?? [];
      const traceTotal = traces.reduce(
        (sum, trace) => sum + Number(trace.allocated_amount),
        0,
      );
      const lineAmount =
        line.quantity *
        Number(line.unit_price) *
        (1 - Number(line.discount_percent) / 100);
      return traces.length < 2 || Math.abs(traceTotal - lineAmount) > 0.0001;
    });
    if (untraceableAggregate) {
      throw new ConflictException({
        statusCode: 409,
        error: 'BUNDLE_AGGREGATION_TRACE_INVALID',
        message: `Aggregated invoice line '${untraceableAggregate.id}' does not retain complete component/amount traceability`,
      });
    }

    const issuedAt = new Date();
    const totalAmount = (invoice.lines || []).reduce(
      (sum, line) =>
        sum +
        line.quantity *
          Number(line.unit_price) *
          (1 - Number(line.discount_percent) / 100) +
        Number(line.tax_amount),
      0,
    );
    const immutableSnapshot = JSON.stringify({
      invoiceId: invoice.id,
      commercialAccountId: invoice.commercial_account_id,
      contractId: invoice.contract_id,
      currency: invoice.currency,
      representationScope: 'COMMERCIAL_ENTITLEMENT_OR_OBLIGATION',
      securityOutcomeProof: false,
      serviceExceptionRemedy: 'APPEND_ONLY_CREDIT_NOTE',
      issuedAt: issuedAt.toISOString(),
      totalAmount,
      lines: (invoice.lines || []).map((line) => ({
        id: line.id,
        orderLineId: line.order_line_id,
        priceBookId: line.price_book_id,
        sku: line.sku,
        contractId: line.contract_id,
        subscriptionId: line.subscription_id,
        servicePeriodStart: line.service_period_start,
        servicePeriodEnd: line.service_period_end,
        quantity: line.quantity,
        unitPrice: Number(line.unit_price),
        discountPercent: Number(line.discount_percent),
        taxAmount: Number(line.tax_amount),
        taxRuleId: line.tax_rule_id,
        currency: line.currency,
        presentationMode: line.presentation_mode,
        representationScope: line.representation_scope,
        bases: (line.bases || []).map((basis) => ({
          basisType: basis.basis_type,
          sourceId: basis.source_id,
          sourceStatus: basis.source_status,
          sourceVersion: basis.source_version,
          quantity: basis.quantity,
          unit: basis.unit,
          sourceSnapshotHash: basis.source_snapshot_hash,
        })),
        traces: (line.traces || []).map((trace) => ({
          orderLineId: trace.order_line_id,
          allocatedAmount: Number(trace.allocated_amount),
          currency: trace.currency,
        })),
      })),
    });

    return this.prisma.commercialInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'ISSUED',
        issued_at: issuedAt,
        total_amount: totalAmount,
        immutable_snapshot: immutableSnapshot,
      },
    });
  }

  /**
   * Part 12: corrections to an ISSUED invoice are append-only credit/debit
   * notes — the original issued invoice row is never mutated.
   */
  async issueCreditNote(invoiceId: string, amount: number, reason: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'ISSUED') {
      throw new ConflictException(
        `Credit notes can only be issued against an ISSUED invoice, '${invoiceId}' is '${invoice.status}'`,
      );
    }

    return this.prisma.commercialCreditNote.create({
      data: {
        invoice_id: invoiceId,
        amount,
        currency: invoice.currency,
        reason,
        status: 'ISSUED',
        issued_at: new Date(),
      },
    });
  }

  async issueDebitNote(invoiceId: string, amount: number, reason: string) {
    const invoice = await this.prisma.commercialInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice '${invoiceId}' not found`);
    }
    if (invoice.status !== 'ISSUED') {
      throw new ConflictException(
        `Debit notes can only be issued against an ISSUED invoice, '${invoiceId}' is '${invoice.status}'`,
      );
    }

    return this.prisma.commercialDebitNote.create({
      data: {
        invoice_id: invoiceId,
        amount,
        currency: invoice.currency,
        reason,
        status: 'ISSUED',
        issued_at: new Date(),
      },
    });
  }

  /**
   * Get invoices for commercial account
   */
  async getInvoicesByAccount(commercialAccountId: string) {
    return this.prisma.commercialInvoice.findMany({
      where: { commercial_account_id: commercialAccountId },
      include: {
        lines: { include: { bases: true, traces: true } },
        creditNotes: true,
        debitNotes: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
