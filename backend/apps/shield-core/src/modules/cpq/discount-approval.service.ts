import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { AuthorizationService } from '../authorization/authorization.service';

const APPROVAL_ROLES = [
  'COMMERCIAL_APPROVER',
  'FINANCE_COMMERCIAL_APPROVER',
  'EXECUTIVE_COMMERCIAL_APPROVER',
] as const;

const ROLE_RANK: Record<(typeof APPROVAL_ROLES)[number], number> = {
  COMMERCIAL_APPROVER: 1,
  FINANCE_COMMERCIAL_APPROVER: 2,
  EXECUTIVE_COMMERCIAL_APPROVER: 3,
};

export class DiscountRampPhaseDto {
  @IsInt()
  @Min(1)
  startMonth!: number;

  @IsInt()
  @Min(1)
  endMonth!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  quantityPercent!: number;
}

export class QuoteDiscountTermsDto {
  @IsString()
  reason!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscountRampPhaseDto)
  rampSchedule!: DiscountRampPhaseDto[];

  @IsNumber()
  @Min(0)
  minimumCommitAmount!: number;

  @IsISO8601()
  discountExpiresAt!: Date;
}

export class CreateDiscountAuthorityPolicyDto {
  @IsOptional()
  @IsString()
  policyKey?: string;

  @IsOptional()
  @IsString()
  supersedesPolicyId?: string;

  @IsString()
  serviceClass!: string;

  @IsString()
  region!: string;

  @IsString()
  currency!: string;

  @IsNumber()
  @Min(-100)
  @Max(100)
  standardMarginFloorPercent!: number;

  @IsNumber()
  @Min(-100)
  @Max(100)
  financeMarginFloorPercent!: number;

  @IsNumber()
  @Min(-100)
  @Max(100)
  absoluteMarginFloorPercent!: number;

  @IsISO8601()
  effectiveFrom!: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;
}

export class DecideDiscountAuthorityPolicyDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class DecideQuoteDiscountDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export interface DiscountableQuoteLine {
  sku: string;
  offerFamily: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  priceBookMinimumCommit: number;
}

export interface AnalyzeQuoteDiscountInput {
  tenantId: string;
  environmentId: string;
  region: string;
  currency: string;
  termMonths: number;
  quoteExpiresAt: Date;
  technicalAuthorityHash: string;
  requestedBy: string;
  lines: DiscountableQuoteLine[];
  partnerEconomics: {
    route: 'DIRECT' | 'PARTNER';
    partnerAgreementId?: string;
    commissionPercent?: number;
    marginPercent?: number;
  };
  terms: QuoteDiscountTermsDto;
}

@Injectable()
export class DiscountApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
    private readonly authorization: AuthorizationService,
  ) {}

  async createPolicy(dto: CreateDiscountAuthorityPolicyDto, actorId: string) {
    if (
      dto.standardMarginFloorPercent < dto.financeMarginFloorPercent ||
      dto.financeMarginFloorPercent < dto.absoluteMarginFloorPercent
    ) {
      throw new BadRequestException(
        'Margin floors must descend from standard to Finance to absolute',
      );
    }
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo
      ? new Date(dto.effectiveTo)
      : undefined;
    if (
      Number.isNaN(effectiveFrom.getTime()) ||
      (effectiveTo &&
        (Number.isNaN(effectiveTo.getTime()) || effectiveTo <= effectiveFrom))
    ) {
      throw new BadRequestException('Policy effective dates are invalid');
    }

    let policyKey = dto.policyKey?.trim() || `discount-${randomUUID()}`;
    let version = 1;
    let supersedesPolicyId: string | undefined;
    if (dto.supersedesPolicyId) {
      const prior = await this.prisma.discountAuthorityPolicy.findUnique({
        where: { id: dto.supersedesPolicyId },
      });
      if (!prior) {
        throw new NotFoundException(
          `Discount authority policy '${dto.supersedesPolicyId}' not found`,
        );
      }
      if (
        prior.service_class !== dto.serviceClass.trim().toUpperCase() ||
        prior.region !== dto.region.trim().toUpperCase() ||
        prior.currency !== dto.currency.trim().toUpperCase()
      ) {
        throw new ConflictException(
          'A policy revision cannot change service class, region, or currency',
        );
      }
      policyKey = prior.policy_key;
      version = prior.version + 1;
      supersedesPolicyId = prior.id;
    }

    return this.prisma.discountAuthorityPolicy.create({
      data: {
        policy_key: policyKey,
        version,
        supersedes_policy_id: supersedesPolicyId,
        service_class: dto.serviceClass.trim().toUpperCase(),
        region: dto.region.trim().toUpperCase(),
        currency: dto.currency.trim().toUpperCase(),
        standard_margin_floor_percent: dto.standardMarginFloorPercent,
        finance_margin_floor_percent: dto.financeMarginFloorPercent,
        absolute_margin_floor_percent: dto.absoluteMarginFloorPercent,
        status: 'PENDING_APPROVAL',
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        requested_by: actorId,
      },
    });
  }

  async listPolicies(filters?: {
    serviceClass?: string;
    region?: string;
    currency?: string;
  }) {
    return this.prisma.discountAuthorityPolicy.findMany({
      where: {
        ...(filters?.serviceClass
          ? { service_class: filters.serviceClass.trim().toUpperCase() }
          : {}),
        ...(filters?.region
          ? { region: filters.region.trim().toUpperCase() }
          : {}),
        ...(filters?.currency
          ? { currency: filters.currency.trim().toUpperCase() }
          : {}),
      },
      orderBy: [{ policy_key: 'asc' }, { version: 'desc' }],
    });
  }

  async decidePolicy(
    policyId: string,
    actorId: string,
    dto: DecideDiscountAuthorityPolicyDto,
  ) {
    const policy = await this.prisma.discountAuthorityPolicy.findUnique({
      where: { id: policyId },
    });
    if (!policy) {
      throw new NotFoundException(
        `Discount authority policy '${policyId}' not found`,
      );
    }
    if (policy.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Discount authority policy is '${policy.status}', not PENDING_APPROVAL`,
      );
    }
    if (policy.requested_by === actorId) {
      throw new ForbiddenException(
        'Policy requester cannot approve or reject their own threshold policy',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.decision === 'APPROVED' && policy.supersedes_policy_id) {
        await tx.discountAuthorityPolicy.update({
          where: { id: policy.supersedes_policy_id },
          data: {
            status: 'SUPERSEDED',
            effective_to: policy.effective_from,
          },
        });
      }
      return tx.discountAuthorityPolicy.update({
        where: { id: policy.id },
        data: {
          status: dto.decision,
          decided_by: actorId,
          decided_at: new Date(),
          decision_reason: dto.reason,
        },
      });
    });
  }

  private validateRamp(
    phases: DiscountRampPhaseDto[],
    termMonths: number,
  ): number {
    if (!phases.length) {
      throw new BadRequestException(
        'Discount approval requires a complete ramp schedule',
      );
    }
    const sorted = [...phases].sort((a, b) => a.startMonth - b.startMonth);
    let expectedStart = 1;
    let previousQuantity = -1;
    let equivalentFullRunRateMonths = 0;
    for (const phase of sorted) {
      if (
        !Number.isInteger(phase.startMonth) ||
        !Number.isInteger(phase.endMonth) ||
        phase.startMonth !== expectedStart ||
        phase.endMonth < phase.startMonth ||
        phase.endMonth > termMonths ||
        phase.quantityPercent < 0 ||
        phase.quantityPercent > 100 ||
        phase.quantityPercent < previousQuantity
      ) {
        throw new BadRequestException(
          'Ramp phases must be contiguous, within the quote term, and non-decreasing',
        );
      }
      const months = phase.endMonth - phase.startMonth + 1;
      equivalentFullRunRateMonths += months * (phase.quantityPercent / 100);
      expectedStart = phase.endMonth + 1;
      previousQuantity = phase.quantityPercent;
    }
    if (expectedStart !== termMonths + 1 || previousQuantity !== 100) {
      throw new BadRequestException(
        'Ramp schedule must cover the full term and end at 100% quantity',
      );
    }
    return equivalentFullRunRateMonths;
  }

  private async activePolicy(
    serviceClass: string,
    region: string,
    currency: string,
    at: Date,
  ) {
    const policies = await this.prisma.discountAuthorityPolicy.findMany({
      where: {
        service_class: serviceClass,
        status: 'APPROVED',
        effective_from: { lte: at },
        AND: [
          { OR: [{ effective_to: null }, { effective_to: { gte: at } }] },
          { OR: [{ region }, { region: 'GLOBAL' }] },
          { OR: [{ currency }, { currency: '*' }] },
        ],
      },
      orderBy: { version: 'desc' },
    });
    return policies.sort((a, b) => {
      const score = (policy: { region: string; currency: string }) =>
        (policy.region === region ? 2 : 0) +
        (policy.currency === currency ? 1 : 0);
      return score(b) - score(a) || b.version - a.version;
    })[0];
  }

  private async currentUnitCost(serviceClass: string, tenantId: string) {
    const where = {
      usage_class: serviceClass,
      period_end: { lte: new Date() },
    };
    return (
      (await this.prisma.costRecord.findFirst({
        where: { ...where, tenant_id: tenantId },
        orderBy: { period_end: 'desc' },
      })) ??
      (await this.prisma.costRecord.findFirst({
        where: { ...where, tenant_id: null },
        orderBy: { period_end: 'desc' },
      }))
    );
  }

  async analyze(input: AnalyzeQuoteDiscountInput) {
    const discountExpiry = new Date(input.terms.discountExpiresAt);
    if (
      Number.isNaN(discountExpiry.getTime()) ||
      discountExpiry <= new Date() ||
      discountExpiry > input.quoteExpiresAt
    ) {
      throw new BadRequestException(
        'Discount expiry must be future-dated and no later than quote expiry',
      );
    }
    if (!input.terms.reason.trim()) {
      throw new BadRequestException('Discount reason is required');
    }
    const rampMonths = this.validateRamp(
      input.terms.rampSchedule,
      input.termMonths,
    );
    const catalogMinimumCommit = input.lines.reduce(
      (sum, line) => sum + line.priceBookMinimumCommit,
      0,
    );
    if (input.terms.minimumCommitAmount < catalogMinimumCommit) {
      throw new ConflictException({
        statusCode: 409,
        error: 'DISCOUNT_MINIMUM_COMMIT_BELOW_CATALOG',
        message: `Requested minimum ${input.terms.minimumCommitAmount} is below catalog minimum ${catalogMinimumCommit}`,
      });
    }

    const grouped = new Map<string, DiscountableQuoteLine[]>();
    for (const line of input.lines) {
      const serviceClass = line.offerFamily.trim().toUpperCase();
      grouped.set(serviceClass, [...(grouped.get(serviceClass) ?? []), line]);
    }

    const partnerRate =
      input.partnerEconomics.route === 'PARTNER'
        ? input.partnerEconomics.commissionPercent ?? 0
        : 0;
    const analyses: Array<Record<string, unknown>> = [];
    const policyIds: string[] = [];
    let requiredRank = 1;
    let totalFinancialImpact = 0;
    let largestMarginImpact = 0;
    let totalPartnerPassThrough = 0;

    for (const [serviceClass, lines] of grouped) {
      const [policy, cost] = await Promise.all([
        this.activePolicy(
          serviceClass,
          input.region.toUpperCase(),
          input.currency.toUpperCase(),
          new Date(),
        ),
        this.currentUnitCost(serviceClass, input.tenantId),
      ]);
      if (!policy) {
        throw new ConflictException({
          statusCode: 409,
          error: 'DISCOUNT_AUTHORITY_POLICY_MISSING',
          message: `No approved effective discount authority policy exists for ${serviceClass}/${input.region}/${input.currency}`,
        });
      }
      if (!cost || Number(cost.quantity) <= 0 || Number(cost.unit_cost) < 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'UNIT_ECONOMICS_COST_BASIS_MISSING',
          message: `No usable current cost basis exists for service class ${serviceClass}`,
        });
      }

      const unitCost = Number(cost.unit_cost);
      const listRevenue = lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice * rampMonths,
        0,
      );
      const discountedRevenue = lines.reduce(
        (sum, line) =>
          sum +
          line.quantity *
            line.unitPrice *
            (1 - line.discountPercent / 100) *
            rampMonths,
        0,
      );
      const deliveryCost = lines.reduce(
        (sum, line) => sum + line.quantity * unitCost * rampMonths,
        0,
      );
      const partnerPassThrough = discountedRevenue * (partnerRate / 100);
      const listPartnerPassThrough = listRevenue * (partnerRate / 100);
      const grossMarginPercent =
        discountedRevenue > 0
          ? ((discountedRevenue - deliveryCost - partnerPassThrough) /
              discountedRevenue) *
            100
          : -100;
      const listMarginPercent =
        listRevenue > 0
          ? ((listRevenue - deliveryCost - listPartnerPassThrough) /
              listRevenue) *
            100
          : -100;
      const standardFloor = Number(policy.standard_margin_floor_percent);
      const financeFloor = Number(policy.finance_margin_floor_percent);
      const absoluteFloor = Number(policy.absolute_margin_floor_percent);
      if (grossMarginPercent < absoluteFloor) {
        throw new ConflictException({
          statusCode: 409,
          error: 'DISCOUNT_BELOW_ABSOLUTE_MARGIN_FLOOR',
          message: `${serviceClass} margin ${grossMarginPercent.toFixed(2)}% is below absolute floor ${absoluteFloor.toFixed(2)}%`,
        });
      }
      const rank =
        grossMarginPercent < financeFloor
          ? 3
          : grossMarginPercent < standardFloor
            ? 2
            : 1;
      requiredRank = Math.max(requiredRank, rank);
      const marginImpact = Math.max(0, listMarginPercent - grossMarginPercent);
      largestMarginImpact = Math.max(largestMarginImpact, marginImpact);
      totalFinancialImpact += Math.max(0, listRevenue - discountedRevenue);
      totalPartnerPassThrough += partnerPassThrough;
      policyIds.push(policy.id);
      analyses.push({
        serviceClass,
        policyId: policy.id,
        costRecordId: cost.id,
        costSource: cost.source,
        unitCost,
        listRevenue,
        discountedRevenue,
        deliveryCost,
        partnerPassThrough,
        listMarginPercent,
        grossMarginPercent,
        marginImpact,
        standardMarginFloorPercent: standardFloor,
        financeMarginFloorPercent: financeFloor,
        absoluteMarginFloorPercent: absoluteFloor,
        requiredAuthorityRank: rank,
        requiredApprovalRole: APPROVAL_ROLES[rank - 1],
      });
    }

    return {
      tenant_id: input.tenantId,
      environment_id: input.environmentId,
      status: 'DRAFT',
      policy_ids: JSON.stringify([...new Set(policyIds)]),
      gross_margin_by_service_class: JSON.stringify(analyses),
      partner_pass_through: JSON.stringify({
        route: input.partnerEconomics.route,
        partnerAgreementId: input.partnerEconomics.partnerAgreementId ?? null,
        commissionPercent: partnerRate,
        partnerMarginPercent: input.partnerEconomics.marginPercent ?? null,
        amount: totalPartnerPassThrough,
        currency: input.currency,
      }),
      term_months: input.termMonths,
      ramp_schedule: JSON.stringify(input.terms.rampSchedule),
      minimum_commit_amount: input.terms.minimumCommitAmount,
      catalog_minimum_commit_amount: catalogMinimumCommit,
      discount_expires_at: discountExpiry,
      required_approval_role: APPROVAL_ROLES[requiredRank - 1],
      authority_rank: requiredRank,
      financial_impact: totalFinancialImpact,
      margin_impact: largestMarginImpact,
      technical_authority_hash: input.technicalAuthorityHash,
      requested_by: input.requestedBy,
      commercial_reason: input.terms.reason,
    };
  }

  async getReview(
    quoteId: string,
    tenantId: string,
    environmentId: string,
  ) {
    const review = await this.prisma.quoteDiscountReview.findFirst({
      where: {
        quote_id: quoteId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
      include: { approval: true },
    });
    if (!review) {
      throw new NotFoundException(
        `Discount review for quote '${quoteId}' not found`,
      );
    }
    return review;
  }

  async submitQuote(
    quoteId: string,
    tenantId: string,
    environmentId: string,
    actorId: string,
  ) {
    const quote = await this.prisma.commercialQuote.findFirst({
      where: { id: quoteId, tenant_id: tenantId, environment_id: environmentId },
      include: { discountReview: true },
    });
    const review = quote?.discountReview;
    if (!quote || !review) {
      throw new NotFoundException(
        `Discount review for quote '${quoteId}' not found`,
      );
    }
    if (quote.status !== 'DRAFT' || review.status !== 'DRAFT') {
      throw new ConflictException('Discounted quote and review must be DRAFT');
    }
    if (review.technical_authority_hash !== quote.configuration_hash) {
      throw new ConflictException(
        'Discount review no longer matches the immutable technical authority',
      );
    }

    const proposedSnapshot = {
      quoteId,
      technicalAuthorityHash: review.technical_authority_hash,
      policyIds: JSON.parse(review.policy_ids),
      grossMarginByServiceClass: JSON.parse(
        review.gross_margin_by_service_class,
      ),
      partnerPassThrough: JSON.parse(review.partner_pass_through),
      commercialReason: review.commercial_reason,
      termMonths: review.term_months,
      rampSchedule: JSON.parse(review.ramp_schedule),
      minimumCommitAmount: Number(review.minimum_commit_amount),
      catalogMinimumCommitAmount: Number(
        review.catalog_minimum_commit_amount,
      ),
      discountExpiresAt: review.discount_expires_at.toISOString(),
      requiredApprovalRole: review.required_approval_role,
      authorityRank: review.authority_rank,
    };

    return this.prisma.$transaction(async (tx) => {
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'NON_STANDARD_DISCOUNT',
          objectType: 'QuoteDiscountReview',
          objectId: review.id,
          tenantId,
          requestedBy: actorId,
          reason: `Discounted quote ${quoteId} requires ${review.required_approval_role} authority`,
          proposedSnapshot,
          financialImpact: Number(review.financial_impact),
          marginImpact: Number(review.margin_impact),
          requiredApprovalRole: review.required_approval_role,
          expiresAt: review.discount_expires_at,
        },
        tx,
      );
      await tx.quoteDiscountReview.update({
        where: { id: review.id },
        data: {
          status: 'PENDING_APPROVAL',
          approval_id: approval.id,
          submitted_at: new Date(),
        },
      });
      return tx.commercialQuote.update({
        where: { id: quote.id },
        data: { status: 'PENDING_APPROVAL', approval_id: approval.id },
        include: {
          lines: true,
          validation: true,
          discountReview: { include: { approval: true } },
          roadmapCommitments: {
            include: { legalApproval: true, productApproval: true },
          },
        },
      });
    });
  }

  async decideQuote(
    quoteId: string,
    tenantId: string,
    environmentId: string,
    actorId: string,
    dto: DecideQuoteDiscountDto,
  ) {
    const review = await this.getReview(quoteId, tenantId, environmentId);
    if (review.status !== 'PENDING_APPROVAL' || !review.approval_id) {
      throw new ConflictException(
        `Discount review is '${review.status}', not PENDING_APPROVAL`,
      );
    }
    const membership = await this.authorization.getMembershipForPrincipal(
      tenantId,
      actorId,
    );
    const actorRank = Math.max(
      0,
      ...(membership?.roles ?? []).map(
        (role) => ROLE_RANK[role.code as keyof typeof ROLE_RANK] ?? 0,
      ),
    );
    if (actorRank < review.authority_rank) {
      throw new ForbiddenException(
        `Discount requires ${review.required_approval_role}; actor authority rank ${actorRank} is insufficient`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.approvals.decideApproval(
        review.approval_id!,
        actorId,
        dto.decision,
        dto.reason,
        tx,
      );
      return tx.quoteDiscountReview.update({
        where: { id: review.id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'APPROVED',
                approved_by: actorId,
                approved_at: new Date(),
              }
            : { status: 'REJECTED', rejected_reason: dto.reason },
        include: { approval: true },
      });
    });
  }
}
