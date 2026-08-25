import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
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
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { CommercialEntitlementService } from '../commercial/commercial-entitlement.service';

export const AI_BILLABLE_METRICS = [
  'NON_BILLABLE',
  'INCLUDED_CAPACITY',
  'WORKFLOW_CLASS',
  'MODEL_CLASS',
  'CONTRACTED_USAGE',
] as const;
export type AiBillableMetric = (typeof AI_BILLABLE_METRICS)[number];

export const AI_OVERAGE_POLICIES = [
  'BLOCK',
  'RATE_LIMIT',
  'DEGRADE',
  'CONTRACT_AUTHORIZED',
] as const;

export class CreateAiGovernanceProfileDto {
  @IsString()
  commercialAccountId!: string;

  @IsString()
  contractId!: string;

  @IsString()
  priceBookId!: string;

  @IsString()
  profileKey!: string;

  @IsString()
  planSku!: string;

  @IsBoolean()
  tenantEnabled!: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedUseCaseKeys!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedRegions!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  allowedModelProfileIds!: string[];

  @IsIn(AI_BILLABLE_METRICS)
  billableMetric!: AiBillableMetric;

  @IsOptional()
  @IsString()
  meterKey?: string;

  @IsOptional()
  @IsUUID()
  usageAuthorizationId?: string;

  @IsOptional()
  @IsString()
  customerAuthorizationRef?: string;

  @IsNumber()
  @Min(0)
  includedAllowance!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  warningThresholdPercent!: number;

  @IsIn(AI_OVERAGE_POLICIES)
  overagePolicy!: (typeof AI_OVERAGE_POLICIES)[number];

  @IsOptional()
  @IsNumber()
  @IsPositive()
  overageCap?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  rateLimitAtPercent!: number;

  @IsBoolean()
  fallbackAllowed!: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fallbackModelProfileIds?: string[];

  @IsBoolean()
  fallbackCustomerChargeAllowed!: boolean;

  @IsOptional()
  @IsString()
  fallbackAuthorizationRef?: string;

  @IsISO8601()
  effectiveFrom!: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;

  @IsString()
  reason!: string;
}

export class DecideAiGovernanceProfileDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class ActivateAiGovernanceProfileDto {
  @IsString()
  activationReference!: string;
}

/**
 * Category H commercial authority for AI. Runtime access and customer billing
 * both derive from one approved, versioned profile; provider cost never edits
 * that profile or its customer price book.
 */
@Injectable()
export class AiGovernanceProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
    private readonly entitlements: CommercialEntitlementService,
  ) {}

  private required(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private unique(values: string[], field: string) {
    const normalized = values.map((value) => this.required(value, field));
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException(`${field} must not contain duplicates`);
    }
    return normalized;
  }

  private parseArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  async get(id: string, tenantId: string, environmentId: string) {
    const profile = await this.prisma.aiGovernanceProfile.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!profile) {
      throw new NotFoundException(`AI governance profile '${id}' not found`);
    }
    return profile;
  }

  async list(tenantId: string, environmentId: string) {
    return this.prisma.aiGovernanceProfile.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: [{ profile_key: 'asc' }, { version: 'desc' }],
    });
  }

  private async validateCommercialAuthority(
    tenantId: string,
    environmentId: string,
    dto: CreateAiGovernanceProfileDto,
  ) {
    const now = new Date();
    const [binding, contract, priceBook, entitled] = await Promise.all([
      this.prisma.commercialAccountTenantBinding.findFirst({
        where: {
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          environment_id: environmentId,
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gte: now } }],
        },
      }),
      this.prisma.contract.findFirst({
        where: {
          id: dto.contractId,
          commercial_account_id: dto.commercialAccountId,
          status: 'ACTIVE',
        },
      }),
      this.prisma.priceBook.findFirst({
        where: {
          id: dto.priceBookId,
          status: 'ACTIVE',
          OR: [
            { commercial_account_id: null },
            { commercial_account_id: dto.commercialAccountId },
          ],
          effective_from: { lte: now },
          AND: [
            { OR: [{ effective_to: null }, { effective_to: { gte: now } }] },
          ],
        },
        include: { product: true, catalogVersion: true },
      }),
      this.entitlements.checkEntitlement(tenantId, 'AI_SECURITY'),
    ]);
    if (!binding) {
      throw new ConflictException('Active tenant/account binding is required');
    }
    if (!contract) {
      throw new ConflictException('An ACTIVE matching contract is required');
    }
    if (!priceBook) {
      throw new ConflictException('An ACTIVE matching price book is required');
    }
    if (!entitled) {
      throw new ConflictException('An active AI_SECURITY entitlement is required');
    }
    if (
      priceBook.catalog_version_id !== contract.catalog_version_id ||
      priceBook.catalogVersion.status !== 'APPROVED'
    ) {
      throw new ConflictException(
        'Contract and price book must use the same approved catalog version',
      );
    }
    if (
      priceBook.product.sku !== dto.planSku ||
      priceBook.product.offer_family !== 'AI_SECURITY' ||
      priceBook.product.release_status !== 'RELEASED'
    ) {
      throw new ConflictException(
        'Price book must reference the released AI_SECURITY plan SKU',
      );
    }
    if (
      dto.billableMetric !== 'NON_BILLABLE' &&
      (!priceBook.margin_gate_passed ||
        !priceBook.approval_id ||
        !priceBook.public_disclosure_approved)
    ) {
      throw new ConflictException(
        'Billable AI requires an approved, disclosed, margin-gated price book',
      );
    }
    return { contract, priceBook };
  }

  private validateBillingPolicy(dto: CreateAiGovernanceProfileDto) {
    const billable = dto.billableMetric !== 'NON_BILLABLE';
    if (
      billable &&
      (!dto.meterKey?.trim() || !dto.customerAuthorizationRef?.trim())
    ) {
      throw new BadRequestException(
        'Billable AI requires meterKey and customerAuthorizationRef',
      );
    }
    if (!billable && (dto.meterKey || dto.usageAuthorizationId)) {
      throw new BadRequestException(
        'NON_BILLABLE profiles cannot carry a meter or usage authorization',
      );
    }
    if (dto.overagePolicy === 'CONTRACT_AUTHORIZED' && !billable) {
      throw new BadRequestException(
        'CONTRACT_AUTHORIZED overage requires a billable metric',
      );
    }
    if (
      dto.overagePolicy === 'CONTRACT_AUTHORIZED' &&
      !dto.usageAuthorizationId
    ) {
      throw new BadRequestException(
        'Contract-authorized overage requires usageAuthorizationId',
      );
    }
    if (dto.overagePolicy === 'CONTRACT_AUTHORIZED' && !dto.overageCap) {
      throw new BadRequestException(
        'Contract-authorized overage requires a positive overageCap',
      );
    }
    if (
      dto.overagePolicy !== 'CONTRACT_AUTHORIZED' &&
      dto.overageCap !== undefined
    ) {
      throw new BadRequestException(
        'overageCap is only valid for CONTRACT_AUTHORIZED overage',
      );
    }
    const fallbackProfiles = dto.fallbackModelProfileIds ?? [];
    if (!dto.fallbackAllowed && fallbackProfiles.length) {
      throw new BadRequestException(
        'Fallback model profiles require fallbackAllowed=true',
      );
    }
    if (
      dto.fallbackCustomerChargeAllowed &&
      (!dto.fallbackAllowed || !dto.fallbackAuthorizationRef?.trim())
    ) {
      throw new BadRequestException(
        'Chargeable fallback requires an allowed fallback and explicit authorization reference',
      );
    }
  }

  async create(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateAiGovernanceProfileDto,
  ) {
    this.validateBillingPolicy(dto);
    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo
      ? new Date(dto.effectiveTo)
      : undefined;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }
    const allowedUseCases = this.unique(
      dto.allowedUseCaseKeys,
      'allowedUseCaseKeys',
    );
    const allowedRegions = this.unique(dto.allowedRegions, 'allowedRegions');
    const allowedModels = this.unique(
      dto.allowedModelProfileIds,
      'allowedModelProfileIds',
    );
    const fallbackModels = this.unique(
      dto.fallbackModelProfileIds ?? [],
      'fallbackModelProfileIds',
    );
    if (fallbackModels.some((id) => allowedModels.includes(id))) {
      throw new BadRequestException(
        'A fallback model cannot also be a primary allowed model',
      );
    }
    const { contract, priceBook } = await this.validateCommercialAuthority(
      tenantId,
      environmentId,
      dto,
    );
    if (
      effectiveFrom < contract.term_start ||
      effectiveFrom > contract.term_end ||
      (effectiveTo && effectiveTo > contract.term_end)
    ) {
      throw new ConflictException('AI profile term must remain within contract term');
    }
    const modelProfiles = await this.prisma.modelProfile.findMany({
      where: { id: { in: [...allowedModels, ...fallbackModels] }, status: 'ACTIVE' },
    });
    if (modelProfiles.length !== allowedModels.length + fallbackModels.length) {
      throw new ConflictException(
        'Every configured primary and fallback ModelProfile must be ACTIVE',
      );
    }
    if (modelProfiles.some((profile) => !allowedRegions.includes(profile.region))) {
      throw new ConflictException(
        'Every configured ModelProfile region must be explicitly allowed',
      );
    }
    const profileKey = this.required(dto.profileKey, 'profileKey');
    const latest = await this.prisma.aiGovernanceProfile.findFirst({
      where: { tenant_id: tenantId, environment_id: environmentId, profile_key: profileKey },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const reason = this.required(dto.reason, 'reason');
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.aiGovernanceProfile.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          commercial_account_id: dto.commercialAccountId,
          contract_id: dto.contractId,
          price_book_id: dto.priceBookId,
          profile_key: profileKey,
          version,
          plan_sku: dto.planSku.trim(),
          tenant_enabled: dto.tenantEnabled,
          allowed_use_case_keys: JSON.stringify(allowedUseCases),
          allowed_regions: JSON.stringify(allowedRegions),
          allowed_model_profile_ids: JSON.stringify(allowedModels),
          billable_metric: dto.billableMetric,
          meter_key: dto.meterKey?.trim(),
          usage_authorization_id: dto.usageAuthorizationId,
          catalog_version_id: priceBook.catalog_version_id,
          customer_authorization_ref: dto.customerAuthorizationRef?.trim(),
          included_allowance: dto.includedAllowance,
          warning_threshold_percent: dto.warningThresholdPercent,
          overage_policy: dto.overagePolicy,
          overage_cap: dto.overageCap,
          rate_limit_at_percent: dto.rateLimitAtPercent,
          fallback_allowed: dto.fallbackAllowed,
          fallback_model_profile_ids: JSON.stringify(fallbackModels),
          fallback_customer_charge_allowed: dto.fallbackCustomerChargeAllowed,
          fallback_authorization_ref: dto.fallbackAuthorizationRef?.trim(),
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'AI_GOVERNANCE_PROFILE',
          objectType: 'AiGovernanceProfile',
          objectId: profile.id,
          tenantId,
          requestedBy,
          reason,
          proposedSnapshot: {
            profileKey,
            version,
            planSku: dto.planSku,
            catalogVersionId: priceBook.catalog_version_id,
            allowedUseCases,
            allowedRegions,
            allowedModels,
            billableMetric: dto.billableMetric,
            meterKey: dto.meterKey,
            includedAllowance: dto.includedAllowance,
            overagePolicy: dto.overagePolicy,
            fallbackAllowed: dto.fallbackAllowed,
            fallbackCustomerChargeAllowed: dto.fallbackCustomerChargeAllowed,
            rawTokensAreInternalCostOnly: true,
          },
          financialImpact:
            Number(priceBook.minimum_commit) +
            Number(dto.overageCap ?? 0) * Number(priceBook.overage_rate),
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
        },
        tx,
      );
      return tx.aiGovernanceProfile.update({
        where: { id: profile.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async decide(
    id: string,
    tenantId: string,
    environmentId: string,
    decidedBy: string,
    dto: DecideAiGovernanceProfileDto,
  ) {
    const profile = await this.get(id, tenantId, environmentId);
    if (profile.status !== 'PENDING_APPROVAL' || !profile.approval_id) {
      throw new ConflictException(`AI governance profile '${id}' has no pending approval`);
    }
    await this.approvals.decideApproval(
      profile.approval_id,
      decidedBy,
      dto.decision,
      this.required(dto.reason, 'reason'),
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.aiGovernanceProfile.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? { status: 'APPROVED', approved_by: decidedBy, approved_at: new Date() }
            : { status: 'REJECTED' },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: profile.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async activate(
    id: string,
    tenantId: string,
    environmentId: string,
    activatedBy: string,
    dto: ActivateAiGovernanceProfileDto,
  ) {
    const profile = await this.get(id, tenantId, environmentId);
    const now = new Date();
    if (
      profile.status !== 'APPROVED' ||
      !profile.tenant_enabled ||
      now < profile.effective_from ||
      (profile.effective_to && now > profile.effective_to)
    ) {
      throw new ConflictException(
        'Activation requires an approved, tenant-enabled profile in its effective term',
      );
    }
    if (!(await this.entitlements.checkEntitlement(tenantId, 'AI_SECURITY'))) {
      throw new ConflictException('AI_SECURITY entitlement is not active');
    }
    const existing = await this.prisma.aiGovernanceProfile.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        profile_key: profile.profile_key,
        status: 'ACTIVE',
        id: { not: id },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Profile '${profile.profile_key}' already has an ACTIVE version`,
      );
    }
    this.required(dto.activationReference, 'activationReference');
    return this.prisma.aiGovernanceProfile.update({
      where: { id },
      data: { status: 'ACTIVE', activated_by: activatedBy, activated_at: now },
    });
  }

  async requireActiveForUsage(params: {
    id: string;
    tenantId: string;
    environmentId: string;
    useCaseKey: string;
    modelProfileId: string;
    region: string;
    fallbackUsed: boolean;
  }) {
    const profile = await this.get(
      params.id,
      params.tenantId,
      params.environmentId,
    );
    const now = new Date();
    if (
      profile.status !== 'ACTIVE' ||
      !profile.tenant_enabled ||
      now < profile.effective_from ||
      (profile.effective_to && now > profile.effective_to)
    ) {
      throw new ConflictException('AI is not enabled by an effective ACTIVE profile');
    }
    if (!(await this.entitlements.checkEntitlement(params.tenantId, 'AI_SECURITY'))) {
      throw new ConflictException('AI_SECURITY entitlement is not active');
    }
    if (!this.parseArray(profile.allowed_use_case_keys).includes(params.useCaseKey)) {
      throw new ConflictException(`AI use case '${params.useCaseKey}' is not approved`);
    }
    if (!this.parseArray(profile.allowed_regions).includes(params.region)) {
      throw new ConflictException(`AI region '${params.region}' is not approved`);
    }
    const allowedModels = params.fallbackUsed
      ? this.parseArray(profile.fallback_model_profile_ids)
      : this.parseArray(profile.allowed_model_profile_ids);
    if (!allowedModels.includes(params.modelProfileId)) {
      throw new ConflictException(
        `ModelProfile '${params.modelProfileId}' is not approved for this path`,
      );
    }
    if (params.fallbackUsed && !profile.fallback_allowed) {
      throw new ConflictException('Provider fallback is not allowed');
    }
    return profile;
  }
}
