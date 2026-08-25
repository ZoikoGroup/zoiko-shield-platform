import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { MeteringService } from '../metering/metering.service';
import {
  AiGovernanceProfileService,
  type AiBillableMetric,
} from './ai-governance-profile.service';

export class RecordAiUsageDto {
  @IsString()
  tenantId!: string;

  @IsString()
  environmentId!: string;

  @IsString()
  governanceProfileId!: string;

  @IsString()
  useCaseKey!: string;

  @IsString()
  workflow!: string;

  @IsString()
  workflowClass!: string;

  @IsString()
  region!: string;

  @IsString()
  provider!: string;

  @IsString()
  model!: string;

  @IsString()
  modelProfileId!: string;

  @IsString()
  modelClass!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  inputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  outputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  toolCalls?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retrievalCalls?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retrievalUnits?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  storageByteHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  contractedUsageUnits?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  complexityUnits?: number;

  /** True provider cost; this is FinOps evidence and never billing authority. */
  @IsNumber()
  @Min(0)
  internalCost!: number;

  @IsString()
  internalCostSource!: string;

  @IsOptional()
  @IsString()
  providerPriceVersion?: string;

  @IsOptional()
  @IsBoolean()
  fallbackUsed?: boolean;

  @IsOptional()
  @IsString()
  fallbackFromModelProfileId?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: Date;
}

export class MarkAiUsageBillableDto {
  /** Optional replay guard; callers cannot select a meter or quantity. */
  @IsOptional()
  @IsString()
  expectedGovernanceProfileId?: string;
}

/**
 * AI-01/AI-02: record provider cost, retrieval, tools and storage for FinOps;
 * derive customer usage only from the approved profile. Raw tokens and
 * caller-provided quantities can never enter the billable path.
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: AiGovernanceProfileService,
    private readonly meteringService: MeteringService,
  ) {}

  private required(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException(`${field} is required`);
    return normalized;
  }

  private derivedQuantity(
    metric: AiBillableMetric,
    usage: { contracted_usage_units: unknown },
  ): number {
    switch (metric) {
      case 'INCLUDED_CAPACITY':
      case 'WORKFLOW_CLASS':
      case 'MODEL_CLASS':
        return 1;
      case 'CONTRACTED_USAGE':
        return Number(usage.contracted_usage_units);
      case 'NON_BILLABLE':
      default:
        return 0;
    }
  }

  async recordUsage(dto: RecordAiUsageDto) {
    const fallbackUsed = dto.fallbackUsed ?? false;
    if (fallbackUsed && !dto.fallbackFromModelProfileId?.trim()) {
      throw new BadRequestException(
        'fallbackFromModelProfileId is required when fallbackUsed=true',
      );
    }
    if (!fallbackUsed && dto.fallbackFromModelProfileId) {
      throw new BadRequestException(
        'fallbackFromModelProfileId is only valid when fallbackUsed=true',
      );
    }
    const profile = await this.profiles.requireActiveForUsage({
      id: dto.governanceProfileId,
      tenantId: dto.tenantId,
      environmentId: dto.environmentId,
      useCaseKey: dto.useCaseKey,
      modelProfileId: dto.modelProfileId,
      region: dto.region,
      fallbackUsed,
    });
    const modelProfile = await this.prisma.modelProfile.findFirst({
      where: {
        id: dto.modelProfileId,
        provider: dto.provider,
        model: dto.model,
        region: dto.region,
        status: 'ACTIVE',
      },
    });
    if (!modelProfile) {
      throw new ConflictException(
        'Provider, model and region do not match an ACTIVE ModelProfile',
      );
    }
    if (
      profile.billable_metric === 'CONTRACTED_USAGE' &&
      Number(dto.contractedUsageUnits ?? 0) <= 0
    ) {
      throw new BadRequestException(
        'contractedUsageUnits must be positive for CONTRACTED_USAGE profiles',
      );
    }
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const billingClassification = fallbackUsed
      ? profile.fallback_customer_charge_allowed &&
        profile.fallback_authorization_ref
        ? 'FALLBACK_CONTRACT_AUTHORIZED_PENDING_METER'
        : 'PREMIUM_FALLBACK_INTERNAL_ONLY'
      : profile.billable_metric === 'NON_BILLABLE'
        ? 'INTERNAL_COST_ONLY'
        : 'CONTRACT_AUTHORIZED_PENDING_METER';

    return this.prisma.$transaction(async (tx) => {
      const usage = await tx.aiUsageRecord.create({
        data: {
          tenant_id: dto.tenantId,
          environment_id: dto.environmentId,
          governance_profile_id: profile.id,
          use_case_key: this.required(dto.useCaseKey, 'useCaseKey'),
          workflow: this.required(dto.workflow, 'workflow'),
          workflow_class: this.required(dto.workflowClass, 'workflowClass'),
          provider: dto.provider,
          model: dto.model,
          model_profile_id: dto.modelProfileId,
          model_class: this.required(dto.modelClass, 'modelClass'),
          input_tokens: dto.inputTokens ?? 0,
          output_tokens: dto.outputTokens ?? 0,
          tool_calls: dto.toolCalls ?? 0,
          retrieval_calls: dto.retrievalCalls ?? 0,
          retrieval_units: dto.retrievalUnits ?? 0,
          ai_storage_byte_hours: dto.storageByteHours ?? 0,
          contracted_usage_units: dto.contractedUsageUnits ?? 0,
          complexity_units: dto.complexityUnits ?? 0,
          internal_cost: dto.internalCost,
          internal_cost_source: this.required(
            dto.internalCostSource,
            'internalCostSource',
          ),
          provider_price_version: dto.providerPriceVersion?.trim(),
          fallback_used: fallbackUsed,
          fallback_from_model_profile_id:
            dto.fallbackFromModelProfileId?.trim(),
          billing_classification: billingClassification,
          billable: false,
          catalog_version_id: profile.catalog_version_id,
          customer_authorization_ref: profile.customer_authorization_ref,
          occurred_at: occurredAt,
        },
      });
      await tx.costRecord.create({
        data: {
          tenant_id: dto.tenantId,
          usage_class: `AI:${dto.environmentId}:${dto.useCaseKey}:${dto.workflowClass}:${dto.modelClass}`,
          provider: dto.provider,
          period_start: occurredAt,
          period_end: occurredAt,
          quantity: 1,
          unit_cost: dto.internalCost,
          total_cost: dto.internalCost,
          allocation_method: 'DIRECT_AI_WORKFLOW',
          source: `AiUsageRecord:${usage.id}:${dto.providerPriceVersion ?? 'UNVERSIONED'}`,
        },
      });
      return usage;
    });
  }

  async getUsageById(tenantId: string, environmentId: string, id: string) {
    const usage = await this.prisma.aiUsageRecord.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!usage) {
      throw new NotFoundException(`AI usage record '${id}' not found`);
    }
    return usage;
  }

  /** Meter, metric, catalog, authorization and quantity are profile-derived. */
  async markBillable(
    tenantId: string,
    environmentId: string,
    usageId: string,
    dto: MarkAiUsageBillableDto = {},
  ) {
    const usage = await this.prisma.aiUsageRecord.findFirst({
      where: {
        id: usageId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
      include: { governanceProfile: true },
    });
    if (!usage)
      throw new NotFoundException(`AI usage record '${usageId}' not found`);
    if (usage.billable) {
      throw new ConflictException(
        `AI usage record '${usageId}' is already billable`,
      );
    }
    const profile = usage.governanceProfile;
    if (!profile || profile.status !== 'ACTIVE' || !profile.tenant_enabled) {
      throw new ConflictException('Usage has no ACTIVE governance profile');
    }
    if (
      dto.expectedGovernanceProfileId &&
      dto.expectedGovernanceProfileId !== profile.id
    ) {
      throw new ConflictException(
        'Governance profile replay guard does not match',
      );
    }
    if (
      profile.billable_metric === 'NON_BILLABLE' ||
      !profile.meter_key ||
      !profile.catalog_version_id ||
      !profile.customer_authorization_ref
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'AI_USAGE_NOT_CONTRACT_AUTHORIZED',
        message:
          'AI usage has no approved catalog and customer billing authorization',
      });
    }
    if (
      usage.fallback_used &&
      (!profile.fallback_customer_charge_allowed ||
        !profile.fallback_authorization_ref)
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'AI_FALLBACK_PREMIUM_NOT_AUTHORIZED',
        message:
          'Provider fallback cost is internal-only without explicit contract authorization',
      });
    }
    const metric = profile.billable_metric as AiBillableMetric;
    const quantity = this.derivedQuantity(metric, usage);
    if (quantity <= 0) {
      throw new ConflictException(
        'Approved AI metric produced no positive quantity',
      );
    }
    const result = await this.meteringService.recordEvent({
      tenantId,
      environmentId,
      meterKey: profile.meter_key,
      source: 'ai-governance',
      sourceEventId: usage.id,
      occurredAt: usage.occurred_at,
      quantity,
      validationState: 'VALID',
      validationReason: 'Derived from approved AI governance profile',
      usageAuthorizationId: profile.usage_authorization_id ?? undefined,
      metadata: {
        aiUsageRecordId: usage.id,
        governanceProfileId: profile.id,
        catalogVersionId: profile.catalog_version_id,
        customerAuthorizationRef: profile.customer_authorization_ref,
        metric,
        workflowClass: usage.workflow_class,
        modelClass: usage.model_class,
        fallbackUsed: usage.fallback_used,
        fallbackAuthorizationRef: usage.fallback_used
          ? profile.fallback_authorization_ref
          : undefined,
        rawTokensExcludedFromBilling: true,
        complexityExcludedUnlessContractMetric: true,
      },
    });
    if (
      !result.usageRecord ||
      Number(result.usageRecord.billable_quantity) <= 0
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'AI_USAGE_NOT_CONTRACT_AUTHORIZED',
        message:
          'AI usage remains evidence only; no approved contract meter policy authorized a charge',
      });
    }
    return this.prisma.aiUsageRecord.update({
      where: { id: usageId },
      data: {
        billable: true,
        billable_quantity: Number(result.usageRecord.billable_quantity),
        meter_event_id: result.event.id,
        billing_classification: 'CONTRACT_METER_AUTHORIZED',
      },
    });
  }

  async visibility(tenantId: string, environmentId: string, profileId: string) {
    const profile = await this.profiles.get(profileId, tenantId, environmentId);
    const now = new Date();
    const periodStart = profile.effective_from;
    const periodEnd = profile.effective_to ?? now;
    const usageRecords = await this.prisma.aiUsageRecord.findMany({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        governance_profile_id: profileId,
        occurred_at: { gte: periodStart, lte: now },
      },
      select: { contracted_usage_units: true },
    });
    const metric = profile.billable_metric as AiBillableMetric;
    const currentUsage = usageRecords.reduce(
      (total, usage) => total + this.derivedQuantity(metric, usage),
      0,
    );
    const allowance = Number(profile.included_allowance);
    const elapsed = Math.max(1, now.getTime() - periodStart.getTime());
    const totalPeriod = Math.max(
      elapsed,
      periodEnd.getTime() - periodStart.getTime(),
    );
    const forecastUsage = (currentUsage / elapsed) * totalPeriod;
    const percent = allowance > 0 ? (currentUsage / allowance) * 100 : 0;
    const warning = percent >= profile.warning_threshold_percent;
    const exhausted = allowance > 0 && currentUsage >= allowance;
    const rateLimited =
      allowance > 0 &&
      percent >= profile.rate_limit_at_percent &&
      profile.overage_policy === 'RATE_LIMIT';
    const degraded = exhausted && profile.overage_policy === 'DEGRADE';
    return {
      profileId: profile.id,
      profileKey: profile.profile_key,
      profileVersion: profile.version,
      planSku: profile.plan_sku,
      catalogVersionId: profile.catalog_version_id,
      metric,
      periodStart,
      periodEnd,
      includedAllowance: allowance,
      currentUsage,
      forecastUsage,
      remainingAllowance: Math.max(0, allowance - currentUsage),
      usagePercent: percent,
      thresholdState: exhausted
        ? 'OVERAGE'
        : warning
          ? 'WARNING'
          : 'WITHIN_ALLOWANCE',
      overagePolicy: profile.overage_policy,
      overageCap:
        profile.overage_cap === null ? null : Number(profile.overage_cap),
      runtimeState: rateLimited
        ? 'RATE_LIMITED'
        : degraded
          ? 'DEGRADED'
          : exhausted && profile.overage_policy === 'BLOCK'
            ? 'BLOCKED'
            : 'AVAILABLE',
      rateLimited,
      degraded,
      rawTokenBilling: false,
    };
  }
}
