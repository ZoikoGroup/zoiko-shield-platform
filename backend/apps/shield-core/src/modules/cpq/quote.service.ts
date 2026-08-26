import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { randomUUID } from 'crypto';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialKillSwitchService } from '../kill-switch/commercial-kill-switch.service';
import { NON_COMMERCIAL_CLASSIFICATIONS } from '../commercial/commercial-account.service';
import { assertTransition } from '../commerce/state-machine.util';
import { OfferReadinessService } from './offer-readiness.service';
import { TaxRuleService } from '../tax/tax-rule.service';
import { ContentHashService } from '../evidence/hashing/content-hash.service';
import {
  DiscountApprovalService,
  QuoteDiscountTermsDto,
} from './discount-approval.service';

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
  @Max(100)
  discountPercent?: number;
}

export class QuoteTaxAssumptionDto {
  @IsString()
  jurisdiction!: string;

  @IsString()
  productTaxClass!: string;

  @IsString()
  sellerLegalEntityReference!: string;
}

export class QuotePartnerEconomicsDto {
  @IsIn(['DIRECT', 'PARTNER'])
  route!: 'DIRECT' | 'PARTNER';

  @IsOptional()
  @IsUUID()
  partnerAgreementId?: string;
}

export class QuoteConfigurationDto {
  @IsString()
  retentionProfile!: string;

  @IsString()
  serviceTier!: string;

  @IsArray()
  @IsString({ each: true })
  connectorDependencies!: string[];

  @IsArray()
  @IsString({ each: true })
  obligations!: string[];

  @IsArray()
  @IsString({ each: true })
  exclusions!: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => QuoteTaxAssumptionDto)
  taxAssumption!: QuoteTaxAssumptionDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => QuotePartnerEconomicsDto)
  partnerEconomics!: QuotePartnerEconomicsDto;
}

export class CreateQuoteDto {
  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  catalogVersionId!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  termMonths?: number;

  @IsOptional()
  @IsString()
  quoteKey?: string;

  @IsOptional()
  @IsUUID()
  supersedesQuoteId?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: Date;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteDiscountTermsDto)
  discountTerms?: QuoteDiscountTermsDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => QuoteConfigurationDto)
  configuration!: QuoteConfigurationDto;

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
    private readonly offerReadiness: OfferReadinessService,
    private readonly taxRules: TaxRuleService,
    private readonly hashes: ContentHashService,
    private readonly discountApprovals: DiscountApprovalService,
  ) {}

  /**
   * ZS-COM-BILL-001 A: production commercial accounts must carry a legal
   * entity, region and billing classification before they can be quoted.
   * Non-commercial classifications (INTERNAL/DEMO/SANDBOX) are exempt so
   * they can never accidentally start generating live commercial records.
   */
  private async assertProductionReadyAccount(
    commercialAccountId: string,
    tenantId: string,
    environmentId: string,
    region: string,
  ) {
    const now = new Date();
    const account = await this.prisma.commercialAccount.findUnique({
      where: { id: commercialAccountId },
      include: {
        tenantBindings: {
          where: {
            tenant_id: tenantId,
            environment_id: environmentId,
            status: 'ACTIVE',
            effective_from: { lte: now },
            OR: [{ effective_to: null }, { effective_to: { gte: now } }],
          },
        },
      },
    });
    if (!account) {
      throw new NotFoundException(
        `Commercial account '${commercialAccountId}' not found`,
      );
    }

    const missing: string[] = [];
    if (!account.customer_legal_name) missing.push('customerLegalName');
    if (!account.billing_address || account.billing_address === '{}')
      missing.push('billingAddress');
    if (!account.tax_facts || account.tax_facts === '{}')
      missing.push('taxFacts');
    if (!account.currency) missing.push('currency');
    if (!account.contacts || account.contacts === '[]')
      missing.push('contacts');
    if (!account.contract_owner_id) missing.push('contractOwnerId');
    if (!account.billing_classification) missing.push('billingClassification');
    if (!account.billing_source) missing.push('billingSource');

    const readyBinding = account.tenantBindings.find(
      (binding) =>
        binding.legal_entity_id &&
        binding.environment_id &&
        binding.region &&
        (binding.region === region || binding.region === 'GLOBAL') &&
        binding.residency_policy &&
        binding.service_scope !== '[]',
    );
    if (!readyBinding) missing.push('activeTenantEnvironmentBinding');

    if (
      NON_COMMERCIAL_CLASSIFICATIONS.includes(account.billing_classification)
    ) {
      if (!readyBinding) {
        throw new NotFoundException(
          `Commercial account '${commercialAccountId}' is not bound to this tenant environment and region`,
        );
      }
      return { account, binding: readyBinding };
    }

    if (missing.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'COMMERCIAL_ACCOUNT_NOT_PRODUCTION_READY',
        message: `Commercial account '${commercialAccountId}' is missing required fields for a live quote: ${missing.join(', ')}`,
      });
    }

    return { account, binding: readyBinding! };
  }

  private normalized(values: string[] | undefined, field: string) {
    if (!Array.isArray(values)) {
      throw new BadRequestException(`${field} must be an explicit array`);
    }
    return [
      ...new Set(values.map((value) => value?.trim()).filter(Boolean)),
    ].sort();
  }

  private requiredString(value: string | undefined, field: string) {
    const result = value?.trim();
    if (!result) throw new BadRequestException(`${field} is required`);
    return result;
  }

  private assertRoadmapCommitmentsApproved(quote: {
    roadmapCommitments?: Array<{
      id: string;
      status: string;
      entitlement_effect: string;
      runtime_access_status: string;
      legalApproval: { status: string } | null;
      productApproval: { status: string } | null;
    }>;
  }) {
    const invalid = (quote.roadmapCommitments ?? []).find(
      (commitment) =>
        !['APPROVED', 'RELEASE_GATE_PASSED'].includes(commitment.status) ||
        commitment.entitlement_effect !== 'NONE' ||
        !['DISABLED', 'ELIGIBLE_FOR_SEPARATE_ORDER'].includes(
          commitment.runtime_access_status,
        ) ||
        !commitment.legalApproval ||
        !['APPROVED', 'APPLIED'].includes(commitment.legalApproval.status) ||
        !commitment.productApproval ||
        !['APPROVED', 'APPLIED'].includes(commitment.productApproval.status),
    );
    if (invalid) {
      throw new ConflictException({
        statusCode: 409,
        error: 'ROADMAP_COMMITMENT_NOT_APPROVED',
        message: `Roadmap commitment '${invalid.id}' requires distinct Legal and Product approval and must remain non-entitling`,
      });
    }
  }

  async createQuote(
    context: {
      tenantId: string;
      environmentId: string;
      region: string;
      actorId: string;
    },
    dto: CreateQuoteDto,
  ) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new ConflictException('A quote requires at least one line');
    }
    if (new Set(dto.lines.map((line) => line.sku)).size !== dto.lines.length) {
      throw new BadRequestException(
        'A quote cannot contain duplicate SKU lines; combine their quantities',
      );
    }
    if (!dto.configuration) {
      throw new BadRequestException(
        'The versioned quote configuration is required',
      );
    }

    const retentionProfile = this.requiredString(
      dto.configuration.retentionProfile,
      'configuration.retentionProfile',
    );
    const serviceTier = this.requiredString(
      dto.configuration.serviceTier,
      'configuration.serviceTier',
    );
    const connectorDependencies = this.normalized(
      dto.configuration.connectorDependencies,
      'configuration.connectorDependencies',
    );
    const obligations = this.normalized(
      dto.configuration.obligations,
      'configuration.obligations',
    );
    const exclusions = this.normalized(
      dto.configuration.exclusions,
      'configuration.exclusions',
    );
    const taxAssumption = dto.configuration.taxAssumption;
    if (!taxAssumption) {
      throw new BadRequestException('configuration.taxAssumption is required');
    }
    const jurisdiction = this.requiredString(
      taxAssumption.jurisdiction,
      'configuration.taxAssumption.jurisdiction',
    );
    const productTaxClass = this.requiredString(
      taxAssumption.productTaxClass,
      'configuration.taxAssumption.productTaxClass',
    );
    const sellerLegalEntityReference = this.requiredString(
      taxAssumption.sellerLegalEntityReference,
      'configuration.taxAssumption.sellerLegalEntityReference',
    );
    const partnerInput = dto.configuration.partnerEconomics;
    if (!partnerInput || !['DIRECT', 'PARTNER'].includes(partnerInput.route)) {
      throw new BadRequestException(
        'configuration.partnerEconomics.route must be DIRECT or PARTNER',
      );
    }
    if (partnerInput.route === 'DIRECT' && partnerInput.partnerAgreementId) {
      throw new BadRequestException(
        'DIRECT quotes cannot reference a partner agreement',
      );
    }
    if (partnerInput.route === 'PARTNER' && !partnerInput.partnerAgreementId) {
      throw new BadRequestException(
        'PARTNER quotes require an approved partnerAgreementId',
      );
    }

    const { account, binding } = await this.assertProductionReadyAccount(
      dto.commercialAccountId,
      context.tenantId,
      context.environmentId,
      context.region,
    );

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

    const region = context.region;
    const currency = (dto.currency || account.currency || 'USD').toUpperCase();
    if (
      !NON_COMMERCIAL_CLASSIFICATIONS.includes(
        account.billing_classification,
      ) &&
      currency !== account.currency.toUpperCase()
    ) {
      throw new ConflictException(
        `Quote currency '${currency}' does not match commercial account transaction currency '${account.currency}'`,
      );
    }
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    let quoteKey = dto.quoteKey?.trim() || randomUUID();
    let version = 1;
    let supersedesQuoteId: string | undefined;
    if (dto.supersedesQuoteId) {
      const prior = await this.getQuoteById(
        dto.supersedesQuoteId,
        context.tenantId,
        context.environmentId,
      );
      if (prior.commercial_account_id !== dto.commercialAccountId) {
        throw new ConflictException(
          'A quote revision must remain bound to the same commercial account',
        );
      }
      if (prior.status === 'CONVERTED') {
        throw new ConflictException(
          'A converted quote cannot be revised; create a contract amendment instead',
        );
      }
      if (dto.quoteKey && dto.quoteKey !== prior.quote_key) {
        throw new BadRequestException(
          'quoteKey must match the superseded quote',
        );
      }
      quoteKey = prior.quote_key;
      version = prior.version + 1;
      supersedesQuoteId = prior.id;
    } else {
      const existingKey = await this.prisma.commercialQuote.findFirst({
        where: {
          commercial_account_id: dto.commercialAccountId,
          quote_key: quoteKey,
        },
        select: { id: true },
      });
      if (existingKey) {
        throw new ConflictException(
          `Quote key '${quoteKey}' already exists; use supersedesQuoteId to create a new version`,
        );
      }
    }

    const resolvedLines: Array<{
      sku: string;
      quantity: number;
      productId: string;
      internalProductKey: string;
      offerFamily: string;
      metricFamily: string;
      priceBookId: string;
      unitPrice: number;
      discountPercent: number;
      priceBookMinimumCommit: number;
    }> = [];

    const selectedProducts = await this.catalogService.validateProductSelection(
      dto.catalogVersionId,
      dto.lines.map((line) => line.sku),
    );
    const productBySku = new Map(
      selectedProducts.map((product) => [product.sku, product]),
    );
    const bundleExpansions = await this.catalogService.resolveBundleExpansions(
      dto.catalogVersionId,
      selectedProducts,
    );

    for (const line of dto.lines) {
      const product = productBySku.get(line.sku);
      if (!product) {
        throw new ConflictException(
          `SKU '${line.sku}' did not resolve to the approved catalog selection`,
        );
      }
      const priceBook = await this.catalogService.getActivePriceBook(
        line.sku,
        region,
        currency,
        dto.commercialAccountId,
        dto.catalogVersionId,
      );
      if (!priceBook) {
        throw new ConflictException({
          statusCode: 409,
          error: 'NO_APPROVED_PRICE_BOOK',
          message: `No approved, effective price book for SKU '${line.sku}' in ${region}/${currency}`,
        });
      }
      if (priceBook.product_id !== product.id) {
        throw new ConflictException(
          `Price book '${priceBook.id}' does not match resolved SKU '${line.sku}'`,
        );
      }
      resolvedLines.push({
        sku: line.sku,
        quantity: line.quantity,
        productId: product.id,
        internalProductKey: product.internal_product_key,
        offerFamily: product.offer_family,
        metricFamily: product.metric_family,
        priceBookId: priceBook.id,
        unitPrice: priceBook.unit_price,
        discountPercent: line.discountPercent || 0,
        priceBookMinimumCommit: Number(priceBook.minimum_commit ?? 0),
      });
    }

    const readinessTargets = [
      ...resolvedLines.map((line) => ({
        productId: line.productId,
      })),
      ...bundleExpansions.flatMap((expansion) =>
        expansion.components.map((component) => ({
          productId: component.productId,
        })),
      ),
    ];
    const readiness = await Promise.all(
      readinessTargets.map((target) =>
        this.offerReadiness.assertReady({
          catalogVersionId: dto.catalogVersionId,
          productId: target.productId,
          region,
          retentionProfile,
          serviceTier,
          connectorDependencies,
          obligations,
        }),
      ),
    );

    const taxableAmount = resolvedLines.reduce(
      (sum, line) =>
        sum + line.quantity * line.unitPrice * (1 - line.discountPercent / 100),
      0,
    );
    const taxResolution = await this.taxRules.resolveTax(
      jurisdiction,
      productTaxClass,
      taxableAmount,
    );
    if (!taxResolution) {
      throw new ConflictException({
        statusCode: 409,
        error: 'TAX_ASSUMPTION_UNRESOLVED',
        message: `No approved tax rule resolves ${jurisdiction}/${productTaxClass}`,
      });
    }

    const now = new Date();
    const partnerAgreement = partnerInput.partnerAgreementId
      ? await this.prisma.partnerAgreement.findFirst({
          where: {
            id: partnerInput.partnerAgreementId,
            status: 'APPROVED',
            effective_from: { lte: now },
            OR: [{ effective_to: null }, { effective_to: { gte: now } }],
          },
        })
      : null;
    if (partnerInput.route === 'PARTNER' && !partnerAgreement) {
      throw new ConflictException(
        `Partner agreement '${partnerInput.partnerAgreementId}' is not currently approved`,
      );
    }

    const requiresApproval = resolvedLines.some((l) => l.discountPercent > 0);
    if (requiresApproval && (!dto.discountTerms || !expiresAt)) {
      throw new BadRequestException(
        'Discounted quotes require discountTerms and an explicit quote expiresAt',
      );
    }
    if (!requiresApproval && dto.discountTerms) {
      throw new BadRequestException(
        'discountTerms are only valid when at least one quote line is discounted',
      );
    }
    const partnerEconomics = partnerAgreement
      ? {
          route: 'PARTNER' as const,
          partnerAgreementId: partnerAgreement.id,
          partnerId: partnerAgreement.partner_id,
          commissionPercent: Number(partnerAgreement.commission_percent),
          marginPercent: Number(partnerAgreement.margin_percent),
          invoiceResponsibility: partnerAgreement.invoice_responsibility,
          taxResponsibility: partnerAgreement.tax_responsibility,
          supportResponsibility: partnerAgreement.support_responsibility,
          renewalRights: partnerAgreement.renewal_rights,
        }
      : { route: 'DIRECT' as const };
    const controlledConfiguration = {
      tenantId: context.tenantId,
      environmentId: context.environmentId,
      commercialAccountId: dto.commercialAccountId,
      activeBindingId: binding.id,
      catalogVersionId: dto.catalogVersionId,
      quoteKey,
      version,
      supersedesQuoteId,
      region,
      currency,
      termMonths: dto.termMonths || 12,
      expiresAt,
      retentionProfile,
      serviceTier,
      connectorDependencies,
      obligations,
      exclusions,
      taxAssumption: {
        jurisdiction,
        productTaxClass,
        sellerLegalEntityReference,
        resolvedTaxRuleId: taxResolution.ruleId,
        ratePercent: taxResolution.ratePercent,
        reverseCharge: taxResolution.reverseCharge,
      },
      partnerEconomics,
      discountTerms: dto.discountTerms ?? null,
      readinessRecordIds: readiness.map((record) => record.id),
      lines: resolvedLines,
      bundleExpansions,
    };
    const { contentHash: configurationHash, canonicalBytes: snapshot } =
      this.hashes.hashCanonicalJson(controlledConfiguration);
    const discountReview = requiresApproval
      ? await this.discountApprovals.analyze({
          tenantId: context.tenantId,
          environmentId: context.environmentId,
          region,
          currency,
          termMonths: dto.termMonths || 12,
          quoteExpiresAt: expiresAt!,
          technicalAuthorityHash: configurationHash,
          requestedBy: context.actorId,
          lines: resolvedLines,
          partnerEconomics,
          terms: dto.discountTerms!,
        })
      : null;

    return this.prisma.commercialQuote.create({
      data: {
        tenant_id: context.tenantId,
        environment_id: context.environmentId,
        commercial_account_id: dto.commercialAccountId,
        catalog_version_id: dto.catalogVersionId,
        status: 'DRAFT',
        quote_key: quoteKey,
        version,
        supersedes_quote_id: supersedesQuoteId,
        currency,
        region,
        term_months: dto.termMonths || 12,
        requires_approval: requiresApproval,
        requested_by: context.actorId,
        expires_at: expiresAt,
        // Frozen point-in-time snapshot: approval/conversion must never
        // re-read live catalog data to reinterpret this quote later.
        snapshot,
        configuration_hash: configurationHash,
        validation_status: 'VALIDATED',
        lines: {
          create: resolvedLines.map((l) => ({
            product_id: l.productId,
            price_book_id: l.priceBookId,
            quantity: l.quantity,
            unit_price: l.unitPrice,
            line_discount_percent: l.discountPercent,
          })),
        },
        validation: {
          create: {
            tenant_id: context.tenantId,
            environment_id: context.environmentId,
            configuration_hash: configurationHash,
            readiness_record_ids: JSON.stringify(
              readiness.map((record) => record.id),
            ),
            price_book_ids: JSON.stringify(
              resolvedLines.map((line) => line.priceBookId),
            ),
            tax_rule_id: taxResolution.ruleId,
            dependency_status: 'PASS',
            incompatibility_status: 'PASS',
            unit_economics_status: 'PASS',
            service_capacity_status: 'PASS',
            market_availability_status: 'PASS',
            claim_eligibility_status: 'PASS',
            partner_economics_status: partnerAgreement
              ? 'APPROVED'
              : 'NOT_APPLICABLE',
            result: 'PASS',
            validated_by: context.actorId,
          },
        },
        ...(discountReview
          ? { discountReview: { create: discountReview } }
          : {}),
      },
      include: {
        lines: true,
        validation: true,
        discountReview: { include: { approval: true } },
        roadmapCommitments: {
          include: { legalApproval: true, productApproval: true },
        },
      },
    });
  }

  /**
   * Part 9: expiry is enforced dynamically on every read/mutation, not only
   * by a background sweeper — a non-terminal quote past its expires_at is
   * flipped to EXPIRED in place before the caller sees or acts on it, so
   * every subsequent mutation (submit/approve/etc.) fails via the ordinary
   * state-machine guard rather than needing its own expiry check.
   */
  async getQuoteById(quoteId: string, tenantId: string, environmentId: string) {
    let quote = await this.prisma.commercialQuote.findFirst({
      where: {
        id: quoteId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
      include: {
        lines: true,
        validation: true,
        discountReview: { include: { approval: true } },
        roadmapCommitments: {
          include: { legalApproval: true, productApproval: true },
        },
      },
    });
    if (!quote) {
      throw new NotFoundException(`Quote '${quoteId}' not found`);
    }

    const nonTerminal = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];
    if (
      nonTerminal.includes(quote.status) &&
      quote.expires_at &&
      quote.expires_at < new Date()
    ) {
      quote = await this.prisma.commercialQuote.update({
        where: { id: quoteId },
        data: { status: 'EXPIRED' },
        include: {
          lines: true,
          validation: true,
          discountReview: { include: { approval: true } },
          roadmapCommitments: {
            include: { legalApproval: true, productApproval: true },
          },
        },
      });
    }

    return quote;
  }

  async submitForApproval(
    quoteId: string,
    tenantId: string,
    environmentId: string,
    actor: string,
  ) {
    const quote = await this.getQuoteById(quoteId, tenantId, environmentId);
    assertTransition(
      ALLOWED_TRANSITIONS,
      quote.status,
      'PENDING_APPROVAL',
      'quote',
    );
    this.assertRoadmapCommitmentsApproved(quote);
    if (
      quote.validation_status !== 'VALIDATED' ||
      !quote.validation ||
      quote.validation.result !== 'PASS' ||
      quote.validation.configuration_hash !== quote.configuration_hash
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'QUOTE_VALIDATION_NOT_CURRENT',
        message:
          'Quote submission requires a matching successful immutable CPQ validation receipt',
      });
    }

    if (quote.requires_approval) {
      return this.discountApprovals.submitQuote(
        quoteId,
        tenantId,
        environmentId,
        actor,
      );
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
  async approveQuote(
    quoteId: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
  ) {
    await this.killSwitchService.assertNotBlocked('QUOTE_APPROVAL');

    const quote = await this.getQuoteById(quoteId, tenantId, environmentId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'APPROVED', 'quote');
    this.assertRoadmapCommitmentsApproved(quote);
    if (quote.requested_by === approverId) {
      throw new ConflictException(
        'Quote requester cannot approve their own quote',
      );
    }
    if (
      quote.validation_status !== 'VALIDATED' ||
      quote.validation?.result !== 'PASS' ||
      quote.validation.configuration_hash !== quote.configuration_hash
    ) {
      throw new ConflictException(
        'Quote approval requires its exact successful validation receipt',
      );
    }

    if (quote.requires_approval) {
      if (!quote.approval_id || !quote.discountReview) {
        throw new ConflictException(
          'Quote requires approval but has no governed discount review',
        );
      }
      if (
        quote.discountReview.status !== 'APPROVED' ||
        quote.discountReview.approval_id !== quote.approval_id ||
        quote.discountReview.technical_authority_hash !==
          quote.configuration_hash ||
        quote.discountReview.discount_expires_at <= new Date()
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'DISCOUNT_AUTHORITY_NOT_GRANTED',
          message:
            'Discount review must be approved, current, and bound to the exact technical authority',
        });
      }
      const approval = await this.approvalService.getApprovalById(
        quote.approval_id,
      );
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
      data: {
        status: 'APPROVED',
        approved_by: approverId,
        approved_at: new Date(),
      },
    });
  }

  async rejectQuote(
    quoteId: string,
    tenantId: string,
    environmentId: string,
    reason: string,
  ) {
    const quote = await this.getQuoteById(quoteId, tenantId, environmentId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'REJECTED', 'quote');
    return this.prisma.commercialQuote.update({
      where: { id: quoteId },
      data: { status: 'REJECTED', rejected_reason: reason },
    });
  }

  async cancelQuote(quoteId: string, tenantId: string, environmentId: string) {
    const quote = await this.getQuoteById(quoteId, tenantId, environmentId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'CANCELLED', 'quote');
    return this.prisma.commercialQuote.update({
      where: { id: quoteId },
      data: { status: 'CANCELLED' },
    });
  }

  /** Called by OrderService once an order has been created from this quote. */
  async markConverted(
    quoteId: string,
    tenantId: string,
    environmentId: string,
  ) {
    const quote = await this.getQuoteById(quoteId, tenantId, environmentId);
    assertTransition(ALLOWED_TRANSITIONS, quote.status, 'CONVERTED', 'quote');
    return this.prisma.commercialQuote.update({
      where: { id: quoteId },
      data: { status: 'CONVERTED' },
    });
  }
}
