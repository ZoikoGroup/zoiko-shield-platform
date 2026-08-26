import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { createHash } from 'crypto';
import type {
  MeterAuthorizationPolicy,
  MeterEvent,
  Prisma,
  UsageRecord,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const PRICING_MODELS = [
  'USAGE',
  'INCLUDED_WITH_OVERAGE',
  'COMMITTED_CAPACITY',
] as const;
const OVERAGE_BEHAVIORS = [
  'PROTECTED_OVERAGE',
  'REQUIRE_APPROVAL',
  'CAP_BILLABLE',
  'NO_OVERAGE',
  'THROTTLE_NON_CRITICAL',
] as const;
const USAGE_TYPES = [
  'STANDARD',
  'EGRESS',
  'ARCHIVE_RETRIEVAL',
  'RETENTION_EXTENSION',
] as const;

export class CreateMeterAuthorizationPolicyDto {
  @IsString()
  policyKey!: string;

  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  contractId!: string;

  @IsUUID()
  meterDefinitionId!: string;

  @IsOptional()
  @IsUUID()
  priceBookId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  authorizedSourceScope!: string[];

  @IsOptional()
  @IsIn(USAGE_TYPES)
  usageType?: (typeof USAGE_TYPES)[number];

  @IsOptional()
  @IsIn(['DAILY', 'MONTHLY'])
  billingPeriod?: 'DAILY' | 'MONTHLY';

  @IsIn(PRICING_MODELS)
  pricingModel!: (typeof PRICING_MODELS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  includedQuantity?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  committedQuantity?: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  warningThresholds!: number[];

  @IsIn(OVERAGE_BEHAVIORS)
  overageBehavior!: (typeof OVERAGE_BEHAVIORS)[number];

  @IsOptional()
  @IsInt()
  @IsPositive()
  capQuantity?: number;

  @IsIn(['CRITICAL_SECURITY', 'NON_CRITICAL'])
  criticality!: 'CRITICAL_SECURITY' | 'NON_CRITICAL';

  @IsObject()
  visibleCustomerPolicy!: Record<string, unknown>;

  @IsObject()
  retentionPolicy!: Record<string, unknown>;

  @IsISO8601()
  effectiveFrom!: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;

  @IsString()
  reason!: string;
}

export class DecideMeterGovernanceDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class CreateMeterUsageAuthorizationDto {
  @IsUUID()
  meterAuthorizationId!: string;

  @IsIn(['OVERAGE', 'EGRESS', 'ARCHIVE_RETRIEVAL', 'RETENTION_EXTENSION'])
  authorizationType!: string;

  @IsISO8601()
  periodStart!: Date;

  @IsISO8601()
  periodEnd!: Date;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxQuantity?: number;

  @IsString()
  reason!: string;

  @IsString()
  customerReference!: string;
}

export class CreateMeterCorrectionDto {
  @IsUUID()
  originalEventId!: string;

  @IsIn(['REVERSAL', 'REPLACEMENT', 'ADJUSTMENT'])
  correctionType!: 'REVERSAL' | 'REPLACEMENT' | 'ADJUSTMENT';

  @IsOptional()
  @IsInt()
  @Min(0)
  replacementQuantity?: number;

  @IsOptional()
  @IsInt()
  adjustmentQuantity?: number;

  @IsString()
  reason!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  evidenceRefs!: string[];
}

export class CreateMeterBillingExportDto {
  @IsUUID()
  meterAuthorizationId!: string;

  @IsISO8601()
  periodStart!: Date;

  @IsISO8601()
  periodEnd!: Date;

  @IsOptional()
  @IsUUID()
  supersedesId?: string;

  @IsOptional()
  @IsUUID()
  correctionRequestId?: string;

  @IsString()
  reason!: string;
}

export type MeterEvaluation = {
  policy: MeterAuthorizationPolicy | null;
  usageAuthorizationId: string | null;
  billableQuantity: number;
  overageQuantity: number;
  classification: string;
  action: string;
};

@Injectable()
export class MeterGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private parseStringArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private parseNumberArray(value: string): number[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is number =>
              typeof item === 'number' && Number.isFinite(item),
          )
        : [];
    } catch {
      return [];
    }
  }

  private stable(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stable(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stable(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  immutableHash(value: unknown) {
    return createHash('sha256').update(this.stable(value)).digest('hex');
  }

  private exportExclusionReason(
    usage: UsageRecord,
    event: MeterEvent | undefined,
    policy: MeterAuthorizationPolicy,
  ): string | null {
    if (!event) return 'MISSING_SOURCE_EVENT';
    if (
      usage.tenant_id !== policy.tenant_id ||
      usage.environment_id !== policy.environment_id ||
      usage.meter_authorization_id !== policy.id ||
      usage.contract_id !== policy.contract_id ||
      usage.meter_definition_id !== policy.meter_definition_id ||
      event.tenant_id !== policy.tenant_id ||
      event.environment_id !== policy.environment_id ||
      event.meter_authorization_id !== policy.id ||
      event.contract_id !== policy.contract_id ||
      event.meter_definition_id !== policy.meter_definition_id
    ) {
      return 'COMMERCIAL_SCOPE_MISMATCH';
    }
    if (
      event.accepted_state !== 'ACCEPTED' ||
      event.validation_state !== 'VALID' ||
      event.dedupe_state !== 'UNIQUE'
    ) {
      return 'EVENT_NOT_ACCEPTED_VALID_UNIQUE';
    }
    if (event.is_platform_generated) return 'PLATFORM_GENERATED';
    if (!['ACCEPTED', 'CORRECTION'].includes(usage.usage_state)) {
      return 'USAGE_STATE_NOT_EXPORTABLE';
    }
    const correction = event.correction_type !== 'ORIGINAL';
    if (
      (usage.usage_state === 'CORRECTION') !== correction ||
      (correction && event.source !== 'CONTROLLED_CORRECTION')
    ) {
      return 'CORRECTION_LINEAGE_INVALID';
    }
    if (
      !correction &&
      (usage.accepted_quantity < 0 ||
        usage.billable_quantity < 0 ||
        usage.overage_quantity < 0 ||
        usage.billable_quantity > usage.accepted_quantity)
    ) {
      return 'ORIGINAL_QUANTITY_INVALID';
    }
    if (
      usage.billable_quantity !== 0 &&
      usage.usage_classification !== 'CONTRACT_AUTHORIZED_BILLABLE' &&
      !usage.usage_classification.startsWith('APPROVED_')
    ) {
      return 'BILLABLE_CLASSIFICATION_INVALID';
    }
    if (
      (usage.billable_quantity === 0 &&
        event.billable_state !== 'NON_BILLABLE') ||
      (usage.billable_quantity !== 0 &&
        !['BILLABLE', 'BILLABLE_CORRECTION'].includes(event.billable_state))
    ) {
      return 'EVENT_USAGE_BILLABLE_STATE_MISMATCH';
    }
    return null;
  }

  periodBounds(occurredAt: Date, billingPeriod: string) {
    const start = new Date(occurredAt);
    const end = new Date(occurredAt);
    if (billingPeriod === 'DAILY') {
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCHours(24, 0, 0, 0);
    } else {
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCMonth(end.getUTCMonth() + 1, 1);
      end.setUTCHours(0, 0, 0, 0);
    }
    return { start, end };
  }

  private async requirePolicy(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const policy = await this.prisma.meterAuthorizationPolicy.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
      include: { meterDefinition: true, contract: true },
    });
    if (!policy) {
      throw new NotFoundException(
        `Meter authorization policy '${id}' not found`,
      );
    }
    return policy;
  }

  listPolicies(tenantId: string, environmentId: string) {
    return this.prisma.meterAuthorizationPolicy.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      include: { meterDefinition: true, contract: true },
      orderBy: [{ policy_key: 'asc' }, { version: 'desc' }],
    });
  }

  getPolicy(id: string, tenantId: string, environmentId: string) {
    return this.requirePolicy(id, tenantId, environmentId);
  }

  async createPolicy(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateMeterAuthorizationPolicyDto,
  ) {
    const policyKey = dto.policyKey.trim();
    const reason = dto.reason.trim();
    const sources = [
      ...new Set(dto.authorizedSourceScope.map((s) => s.trim())),
    ].filter(Boolean);
    const thresholds = [...new Set(dto.warningThresholds)].sort(
      (a, b) => a - b,
    );
    const usageType = dto.usageType ?? 'STANDARD';
    if (!policyKey || !reason || !sources.length) {
      throw new BadRequestException(
        'policyKey, reason and authorizedSourceScope are required',
      );
    }
    if (thresholds.some((threshold) => threshold < 1 || threshold > 100)) {
      throw new BadRequestException(
        'warningThresholds must be unique percentages from 1 to 100',
      );
    }
    const visiblePolicy = dto.visibleCustomerPolicy;
    const retentionPolicy = dto.retentionPolicy;
    if (visiblePolicy.customerVisible !== true) {
      throw new BadRequestException(
        'visibleCustomerPolicy.customerVisible must be true',
      );
    }
    if (
      retentionPolicy.customerVisible !== true ||
      !Array.isArray(retentionPolicy.tiers) ||
      retentionPolicy.tiers.length === 0
    ) {
      throw new BadRequestException(
        'retentionPolicy must be customer-visible and declare retention tiers',
      );
    }
    if (
      retentionPolicy.extensionAvailable === true &&
      (typeof retentionPolicy.extensionPricingDisclosure !== 'string' ||
        !retentionPolicy.extensionPricingDisclosure.trim())
    ) {
      throw new BadRequestException(
        'Retention extensions require an explicit customer-visible pricing disclosure',
      );
    }
    if (
      dto.pricingModel === 'COMMITTED_CAPACITY' &&
      (!dto.committedQuantity || !dto.priceBookId)
    ) {
      throw new BadRequestException(
        'COMMITTED_CAPACITY requires committedQuantity and an approved priceBookId so the fee remains a contract line item',
      );
    }
    if (
      dto.pricingModel !== 'COMMITTED_CAPACITY' &&
      dto.committedQuantity !== undefined
    ) {
      throw new BadRequestException(
        'committedQuantity is only valid for COMMITTED_CAPACITY pricing',
      );
    }
    if (
      ['CAP_BILLABLE', 'THROTTLE_NON_CRITICAL'].includes(dto.overageBehavior) &&
      !dto.capQuantity
    ) {
      throw new BadRequestException(
        `${dto.overageBehavior} requires capQuantity`,
      );
    }
    if (
      dto.overageBehavior === 'THROTTLE_NON_CRITICAL' &&
      dto.criticality === 'CRITICAL_SECURITY'
    ) {
      throw new BadRequestException(
        'Critical security evidence can never be throttled',
      );
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;
    if (
      Number.isNaN(effectiveFrom.getTime()) ||
      (effectiveTo &&
        (Number.isNaN(effectiveTo.getTime()) || effectiveTo <= effectiveFrom))
    ) {
      throw new BadRequestException(
        'effectiveTo must be later than a valid effectiveFrom',
      );
    }

    const [meter, contract, binding] = await Promise.all([
      this.prisma.meterDefinition.findUnique({
        where: { id: dto.meterDefinitionId },
      }),
      this.prisma.contract.findUnique({ where: { id: dto.contractId } }),
      this.prisma.commercialAccountTenantBinding.findFirst({
        where: {
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          environment_id: environmentId,
          status: 'ACTIVE',
          effective_from: { lte: effectiveFrom },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveTo ?? effectiveFrom } },
          ],
        },
      }),
    ]);
    if (!meter || meter.status !== 'APPROVED') {
      throw new ConflictException(
        'Meter authorization requires an APPROVED meter definition',
      );
    }
    if (
      !contract ||
      contract.status !== 'ACTIVE' ||
      contract.commercial_account_id !== dto.commercialAccountId
    ) {
      throw new ConflictException(
        'Meter authorization requires the matching ACTIVE contract',
      );
    }
    if (!binding) {
      throw new ConflictException(
        'Commercial account is not actively bound to this tenant and environment',
      );
    }
    if (
      effectiveFrom < contract.term_start ||
      (effectiveTo ?? contract.term_end) > contract.term_end ||
      effectiveFrom < meter.effective_from ||
      (meter.effective_to &&
        (effectiveTo ?? contract.term_end) > meter.effective_to)
    ) {
      throw new ConflictException(
        'Policy dates must fit the contract and meter effective windows',
      );
    }
    const meterSources = this.parseStringArray(meter.source_scope);
    const outsideMeterScope = sources.filter(
      (source) => !meterSources.includes(source),
    );
    if (outsideMeterScope.length) {
      throw new BadRequestException(
        `Sources are outside the approved meter definition: ${outsideMeterScope.join(', ')}`,
      );
    }
    const overlappingPolicies =
      await this.prisma.meterAuthorizationPolicy.findMany({
        where: {
          tenant_id: tenantId,
          environment_id: environmentId,
          meter_definition_id: meter.id,
          status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
          effective_from: { lt: effectiveTo ?? contract.term_end },
          OR: [{ effective_to: null }, { effective_to: { gt: effectiveFrom } }],
        },
      });
    const ambiguous = overlappingPolicies.find((existing) =>
      this.parseStringArray(existing.authorized_source_scope).some((source) =>
        sources.includes(source),
      ),
    );
    if (ambiguous) {
      throw new ConflictException(
        `Meter policy '${ambiguous.id}' already authorizes an overlapping source and effective window`,
      );
    }

    let overageRate: number | undefined;
    if (dto.priceBookId) {
      const price = await this.prisma.priceBook.findUnique({
        where: { id: dto.priceBookId },
      });
      if (
        !price ||
        price.status !== 'APPROVED' ||
        price.catalog_version_id !== contract.catalog_version_id ||
        (price.commercial_account_id &&
          price.commercial_account_id !== dto.commercialAccountId) ||
        price.effective_from > effectiveFrom ||
        (price.effective_to &&
          (effectiveTo ?? contract.term_end) > price.effective_to)
      ) {
        throw new ConflictException(
          'priceBookId must reference an effective approved contract-compatible price',
        );
      }
      if (usageType !== 'STANDARD' && !price.public_disclosure_approved) {
        throw new ConflictException(
          'Egress, archive and retention pricing must be approved for public disclosure',
        );
      }
      overageRate = price.overage_rate;
    }
    if (
      (dto.overageBehavior === 'PROTECTED_OVERAGE' ||
        usageType !== 'STANDARD') &&
      (!dto.priceBookId || overageRate === undefined)
    ) {
      throw new BadRequestException(
        'Billable overage/egress/archive operations require a catalogued priceBookId',
      );
    }

    const latest = await this.prisma.meterAuthorizationPolicy.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        policy_key: policyKey,
      },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const requiresUsageAuthorization =
      usageType !== 'STANDARD' || dto.overageBehavior === 'REQUIRE_APPROVAL';

    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.meterAuthorizationPolicy.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          commercial_account_id: dto.commercialAccountId,
          contract_id: dto.contractId,
          policy_key: policyKey,
          version,
          meter_definition_id: meter.id,
          price_book_id: dto.priceBookId,
          authorized_source_scope: JSON.stringify(sources),
          usage_type: usageType,
          billing_period: dto.billingPeriod ?? 'MONTHLY',
          pricing_model: dto.pricingModel,
          included_quantity: dto.includedQuantity ?? meter.included_quantity,
          committed_quantity: dto.committedQuantity,
          warning_thresholds: JSON.stringify(thresholds),
          overage_behavior: dto.overageBehavior,
          cap_quantity: dto.capQuantity,
          overage_rate: overageRate,
          criticality: dto.criticality,
          requires_usage_authorization: requiresUsageAuthorization,
          visible_customer_policy: JSON.stringify(visiblePolicy),
          retention_policy: JSON.stringify(retentionPolicy),
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          status: 'PENDING_APPROVAL',
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'METER_CONTRACT_POLICY',
          objectType: 'MeterAuthorizationPolicy',
          objectId: policy.id,
          tenantId,
          requestedBy,
          reason,
          proposedSnapshot: {
            policyKey,
            version,
            contractId: contract.id,
            meterDefinitionId: meter.id,
            meterVersion: meter.version,
            unit: meter.unit,
            authorizedSourceScope: sources,
            usageType,
            pricingModel: dto.pricingModel,
            includedQuantity: policy.included_quantity,
            committedQuantity: dto.committedQuantity,
            warningThresholds: thresholds,
            overageBehavior: dto.overageBehavior,
            capQuantity: dto.capQuantity,
            overageRate,
            requiresUsageAuthorization,
            visibleCustomerPolicy: visiblePolicy,
            retentionPolicy,
            effectiveFrom,
            effectiveTo,
          },
          financialImpact: overageRate,
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
          expiresAt: effectiveTo,
        },
        tx,
      );
      return tx.meterAuthorizationPolicy.update({
        where: { id: policy.id },
        data: { approval_id: approval.id },
        include: { meterDefinition: true, contract: true },
      });
    });
  }

  async decidePolicy(
    id: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    dto: DecideMeterGovernanceDto,
  ) {
    const policy = await this.requirePolicy(id, tenantId, environmentId);
    if (policy.status !== 'PENDING_APPROVAL' || !policy.approval_id) {
      throw new ConflictException(
        `Meter policy '${id}' has no pending linked approval`,
      );
    }
    if (
      dto.decision === 'APPROVED' &&
      (policy.contract.status !== 'ACTIVE' ||
        policy.meterDefinition.status !== 'APPROVED')
    ) {
      throw new ConflictException(
        'Contract and meter definition must still be active and approved',
      );
    }
    await this.approvals.decideApproval(
      policy.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.meterAuthorizationPolicy.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'APPROVED',
                approved_by: approverId,
                approved_at: new Date(),
              }
            : { status: 'REJECTED' },
        include: { meterDefinition: true, contract: true },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: policy.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async resolveEffectivePolicy(
    tenantId: string,
    environmentId: string,
    meterDefinitionId: string,
    source: string,
    occurredAt: Date,
  ) {
    const policies = await this.prisma.meterAuthorizationPolicy.findMany({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        meter_definition_id: meterDefinitionId,
        status: 'APPROVED',
        effective_from: { lte: occurredAt },
        OR: [{ effective_to: null }, { effective_to: { gt: occurredAt } }],
        contract: {
          status: 'ACTIVE',
          term_start: { lte: occurredAt },
          term_end: { gt: occurredAt },
        },
      },
      orderBy: [{ version: 'desc' }, { approved_at: 'desc' }],
    });
    return (
      policies.find((policy) =>
        this.parseStringArray(policy.authorized_source_scope).includes(source),
      ) ?? null
    );
  }

  private async approvedUsageAuthorization(
    policy: MeterAuthorizationPolicy,
    id: string | undefined,
    occurredAt: Date,
    quantity: number,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!id) return null;
    const authorization = await client.meterUsageAuthorization.findFirst({
      where: {
        id,
        tenant_id: policy.tenant_id,
        environment_id: policy.environment_id,
        meter_authorization_id: policy.id,
        status: 'APPROVED',
        period_start: { lte: occurredAt },
        period_end: { gt: occurredAt },
      },
    });
    if (!authorization) return null;
    if (authorization.max_quantity !== null) {
      const consumed = await client.usageRecord.aggregate({
        where: { usage_authorization_id: authorization.id },
        _sum: { accepted_quantity: true },
      });
      if (
        (consumed._sum.accepted_quantity ?? 0) + quantity >
        authorization.max_quantity
      ) {
        return null;
      }
    }
    return authorization;
  }

  async evaluate(
    policy: MeterAuthorizationPolicy,
    quantity: number,
    occurredAt: Date,
    usageAuthorizationId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<MeterEvaluation> {
    const { start, end } = this.periodBounds(occurredAt, policy.billing_period);
    const aggregate = await client.usageRecord.aggregate({
      where: {
        meter_authorization_id: policy.id,
        occurred_at: { gte: start, lt: end },
      },
      _sum: { accepted_quantity: true, billable_quantity: true },
    });
    const acceptedBefore = aggregate._sum.accepted_quantity ?? 0;
    const billableBefore = aggregate._sum.billable_quantity ?? 0;
    const authorization = await this.approvedUsageAuthorization(
      policy,
      usageAuthorizationId,
      occurredAt,
      quantity,
      client,
    );

    let billableQuantity = policy.pricing_model === 'USAGE' ? quantity : 0;
    let overageQuantity = 0;
    if (
      policy.pricing_model === 'INCLUDED_WITH_OVERAGE' ||
      policy.pricing_model === 'COMMITTED_CAPACITY'
    ) {
      const baseQuantity =
        policy.pricing_model === 'COMMITTED_CAPACITY'
          ? (policy.committed_quantity ?? 0)
          : policy.included_quantity;
      const beforeOverage = Math.max(0, acceptedBefore - baseQuantity);
      const afterOverage = Math.max(
        0,
        acceptedBefore + quantity - baseQuantity,
      );
      overageQuantity = afterOverage - beforeOverage;
      billableQuantity = overageQuantity;
    }

    const authorizationRequiredForEvent =
      policy.requires_usage_authorization &&
      (policy.usage_type !== 'STANDARD' ||
        policy.pricing_model === 'USAGE' ||
        overageQuantity > 0);
    if (authorizationRequiredForEvent && !authorization) {
      return {
        policy,
        usageAuthorizationId: null,
        billableQuantity: 0,
        overageQuantity,
        classification: 'CUSTOMER_AUTHORIZATION_REQUIRED',
        action: 'REQUEST_CUSTOMER_APPROVAL',
      };
    }

    if (policy.pricing_model !== 'USAGE') {
      if (policy.overage_behavior === 'NO_OVERAGE') {
        billableQuantity = 0;
      } else if (
        policy.overage_behavior === 'CAP_BILLABLE' ||
        policy.overage_behavior === 'THROTTLE_NON_CRITICAL'
      ) {
        const cap = policy.cap_quantity ?? 0;
        billableQuantity = Math.max(
          0,
          Math.min(overageQuantity, cap - billableBefore),
        );
      }
    } else if (policy.cap_quantity !== null) {
      billableQuantity = Math.max(
        0,
        Math.min(billableQuantity, policy.cap_quantity - billableBefore),
      );
    }

    const capped =
      billableQuantity <
      (policy.pricing_model === 'USAGE' ? quantity : overageQuantity);
    return {
      policy,
      usageAuthorizationId: authorization?.id ?? null,
      billableQuantity,
      overageQuantity,
      classification:
        billableQuantity > 0
          ? 'CONTRACT_AUTHORIZED_BILLABLE'
          : policy.pricing_model === 'COMMITTED_CAPACITY'
            ? 'COMMITTED_CONTRACT_NO_SYNTHETIC_USAGE'
            : 'CONTRACT_AUTHORIZED_NON_BILLABLE',
      action: capped
        ? policy.overage_behavior === 'THROTTLE_NON_CRITICAL'
          ? 'THROTTLE_NON_CRITICAL_SOURCE'
          : 'CAP_BILLING_PRESERVE_EVIDENCE'
        : policy.pricing_model === 'COMMITTED_CAPACITY' && overageQuantity === 0
          ? 'COUNT_AGAINST_COMMITTED_QUANTITY'
          : 'ACCEPT',
    };
  }

  async recordThresholds(policy: MeterAuthorizationPolicy, occurredAt: Date) {
    const capacity =
      policy.pricing_model === 'COMMITTED_CAPACITY'
        ? policy.committed_quantity
        : policy.included_quantity || policy.cap_quantity;
    if (!capacity || capacity <= 0) return [];
    const { start, end } = this.periodBounds(occurredAt, policy.billing_period);
    const aggregate = await this.prisma.usageRecord.aggregate({
      where: {
        meter_authorization_id: policy.id,
        occurred_at: { gte: start, lt: end },
      },
      _sum: { accepted_quantity: true },
    });
    const current = aggregate._sum.accepted_quantity ?? 0;
    const elapsed = Math.max(1, occurredAt.getTime() - start.getTime());
    const duration = end.getTime() - start.getTime();
    const forecast = current * (duration / elapsed);
    const crossed = this.parseNumberArray(policy.warning_thresholds).filter(
      (threshold) =>
        Number.isInteger(threshold) &&
        current >= Math.ceil((capacity * threshold) / 100),
    );
    return Promise.all(
      crossed.map((threshold) =>
        this.prisma.meterThresholdEvent.upsert({
          where: {
            meter_authorization_id_period_start_threshold_percent: {
              meter_authorization_id: policy.id,
              period_start: start,
              threshold_percent: threshold,
            },
          },
          create: {
            tenant_id: policy.tenant_id,
            environment_id: policy.environment_id,
            meter_authorization_id: policy.id,
            period_start: start,
            period_end: end,
            threshold_percent: threshold,
            threshold_quantity: Math.ceil((capacity * threshold) / 100),
            current_quantity: current,
            forecast_quantity: forecast,
          },
          update: { current_quantity: current, forecast_quantity: forecast },
        }),
      ),
    );
  }

  async usageSummary(
    id: string,
    tenantId: string,
    environmentId: string,
    asOf = new Date(),
  ) {
    const policy = await this.requirePolicy(id, tenantId, environmentId);
    const { start, end } = this.periodBounds(asOf, policy.billing_period);
    const aggregate = await this.prisma.usageRecord.aggregate({
      where: {
        meter_authorization_id: id,
        occurred_at: { gte: start, lt: end },
      },
      _sum: {
        accepted_quantity: true,
        billable_quantity: true,
        overage_quantity: true,
      },
    });
    const current = aggregate._sum.accepted_quantity ?? 0;
    const elapsed = Math.max(1, asOf.getTime() - start.getTime());
    const forecast = current * ((end.getTime() - start.getTime()) / elapsed);
    const warnings = await this.prisma.meterThresholdEvent.findMany({
      where: { meter_authorization_id: id, period_start: start },
      orderBy: { threshold_percent: 'asc' },
    });
    return {
      policyId: id,
      contractId: policy.contract_id,
      meter: {
        key: policy.meterDefinition.meter_key,
        version: policy.meterDefinition.version,
        unit: policy.meterDefinition.unit,
      },
      periodStart: start,
      periodEnd: end,
      committedQuantity: policy.committed_quantity,
      includedQuantity: policy.included_quantity,
      currentQuantity: current,
      billableQuantity: aggregate._sum.billable_quantity ?? 0,
      overageQuantity: aggregate._sum.overage_quantity ?? 0,
      forecastQuantity: forecast,
      warningThresholds: this.parseNumberArray(policy.warning_thresholds),
      warnings,
      overageRate: policy.overage_rate,
      overagePolicy: policy.overage_behavior,
      capQuantity: policy.cap_quantity,
      protectedAction:
        policy.criticality === 'CRITICAL_SECURITY'
          ? 'PRESERVE_EVIDENCE_AND_APPLY_BILLING_POLICY'
          : policy.overage_behavior,
      visibleCustomerPolicy: JSON.parse(policy.visible_customer_policy),
      retentionPolicy: JSON.parse(policy.retention_policy),
    };
  }

  listThresholds(tenantId: string, environmentId: string) {
    return this.prisma.meterThresholdEvent.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { created_at: 'desc' },
    });
  }

  async createUsageAuthorization(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateMeterUsageAuthorizationDto,
  ) {
    const policy = await this.requirePolicy(
      dto.meterAuthorizationId,
      tenantId,
      environmentId,
    );
    if (policy.status !== 'APPROVED') {
      throw new ConflictException(
        'Usage authorization requires an APPROVED meter policy',
      );
    }
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('periodEnd must be later than periodStart');
    }
    const expectedAuthorizationType =
      policy.usage_type === 'STANDARD' ? 'OVERAGE' : policy.usage_type;
    if (dto.authorizationType !== expectedAuthorizationType) {
      throw new BadRequestException(
        `authorizationType must be '${expectedAuthorizationType}' for this meter policy`,
      );
    }
    if (
      !dto.reason.trim() ||
      !dto.customerReference.trim() ||
      start < policy.effective_from ||
      (policy.effective_to && end > policy.effective_to)
    ) {
      throw new BadRequestException(
        'Usage authorization requires a customer reference and dates within the policy window',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const authorization = await tx.meterUsageAuthorization.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          meter_authorization_id: policy.id,
          authorization_type: dto.authorizationType,
          period_start: start,
          period_end: end,
          max_quantity: dto.maxQuantity,
          reason: dto.reason.trim(),
          customer_reference: dto.customerReference.trim(),
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'METER_USAGE_AUTHORIZATION',
          objectType: 'MeterUsageAuthorization',
          objectId: authorization.id,
          tenantId,
          requestedBy,
          reason: dto.reason,
          proposedSnapshot: { ...dto, contractId: policy.contract_id },
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
          expiresAt: end,
        },
        tx,
      );
      return tx.meterUsageAuthorization.update({
        where: { id: authorization.id },
        data: { approval_id: approval.id },
      });
    });
  }

  listUsageAuthorizations(tenantId: string, environmentId: string) {
    return this.prisma.meterUsageAuthorization.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { created_at: 'desc' },
    });
  }

  async decideUsageAuthorization(
    id: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    dto: DecideMeterGovernanceDto,
  ) {
    const authorization = await this.prisma.meterUsageAuthorization.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!authorization)
      throw new NotFoundException(
        `Meter usage authorization '${id}' not found`,
      );
    if (
      authorization.status !== 'PENDING_APPROVAL' ||
      !authorization.approval_id
    ) {
      throw new ConflictException(
        `Usage authorization '${id}' has no pending linked approval`,
      );
    }
    await this.approvals.decideApproval(
      authorization.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.meterUsageAuthorization.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'APPROVED',
                approved_by: approverId,
                approved_at: new Date(),
              }
            : { status: 'REJECTED' },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: authorization.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async createCorrection(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateMeterCorrectionDto,
  ) {
    const original = await this.prisma.meterEvent.findFirst({
      where: {
        id: dto.originalEventId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
      include: { meterDefinition: true },
    });
    if (!original)
      throw new NotFoundException(
        `Meter event '${dto.originalEventId}' not found`,
      );
    if (
      original.accepted_state !== 'ACCEPTED' ||
      original.correction_type !== 'ORIGINAL'
    ) {
      throw new ConflictException(
        'Only an original accepted meter event can be corrected',
      );
    }
    const existingCorrection =
      await this.prisma.meterCorrectionRequest.findFirst({
        where: {
          original_event_id: original.id,
          status: { in: ['PENDING_APPROVAL', 'APPLIED'] },
        },
      });
    if (existingCorrection) {
      throw new ConflictException(
        `Meter event '${original.id}' already has active correction '${existingCorrection.id}'`,
      );
    }
    if (
      original.meterDefinition.correction_policy === 'REVERSAL_ONLY' &&
      dto.correctionType !== 'REVERSAL'
    ) {
      throw new ConflictException(
        'The approved meter definition permits reversal corrections only',
      );
    }
    if (
      dto.correctionType === 'REPLACEMENT' &&
      dto.replacementQuantity === undefined
    ) {
      throw new BadRequestException(
        'replacementQuantity is required for REPLACEMENT',
      );
    }
    if (dto.correctionType === 'ADJUSTMENT' && !dto.adjustmentQuantity) {
      throw new BadRequestException(
        'A non-zero adjustmentQuantity is required for ADJUSTMENT',
      );
    }
    if (
      dto.correctionType === 'ADJUSTMENT' &&
      (dto.adjustmentQuantity ?? 0) < -original.quantity
    ) {
      throw new BadRequestException(
        'adjustmentQuantity cannot reduce the original quantity below zero',
      );
    }
    if (!dto.reason.trim() || dto.evidenceRefs.some((ref) => !ref.trim())) {
      throw new BadRequestException(
        'Correction reason and non-empty evidence references are required',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const correction = await tx.meterCorrectionRequest.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          original_event_id: original.id,
          correction_type: dto.correctionType,
          replacement_quantity: dto.replacementQuantity,
          adjustment_quantity: dto.adjustmentQuantity,
          reason: dto.reason.trim(),
          evidence_refs: JSON.stringify(dto.evidenceRefs),
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'METER_CORRECTION',
          objectType: 'MeterCorrectionRequest',
          objectId: correction.id,
          tenantId,
          requestedBy,
          reason: dto.reason,
          proposedSnapshot: {
            ...dto,
            originalImmutableHash: original.immutable_hash,
          },
          requiredApprovalRole: 'BILLING_ADMIN',
        },
        tx,
      );
      return tx.meterCorrectionRequest.update({
        where: { id: correction.id },
        data: { approval_id: approval.id },
      });
    });
  }

  listCorrections(tenantId: string, environmentId: string) {
    return this.prisma.meterCorrectionRequest.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { created_at: 'desc' },
    });
  }

  private async appendCorrectionEvent(
    tx: Prisma.TransactionClient,
    original: MeterEvent,
    correctionId: string,
    type: string,
    quantity: number,
    acceptedQuantity: number,
    billableQuantity: number,
    overageQuantity: number,
  ) {
    const occurredAt = new Date();
    const payload = {
      tenantId: original.tenant_id,
      environmentId: original.environment_id,
      meterDefinitionId: original.meter_definition_id,
      originalEventId: original.id,
      correctionId,
      type,
      quantity,
      acceptedQuantity,
      billableQuantity,
      occurredAt: occurredAt.toISOString(),
    };
    const event = await tx.meterEvent.create({
      data: {
        tenant_id: original.tenant_id,
        environment_id: original.environment_id,
        meter_definition_id: original.meter_definition_id,
        meter_authorization_id: original.meter_authorization_id,
        usage_authorization_id: original.usage_authorization_id,
        contract_id: original.contract_id,
        source: 'CONTROLLED_CORRECTION',
        source_event_id: `${correctionId}:${type}`,
        occurred_at: occurredAt,
        quantity,
        unit: original.unit,
        validation_state: 'VALID',
        validation_reason: `Approved correction ${correctionId}`,
        accepted_state: 'ACCEPTED',
        billable_state:
          billableQuantity === 0 ? 'NON_BILLABLE' : 'BILLABLE_CORRECTION',
        dedupe_state: 'UNIQUE',
        dedupe_key: `correction:${correctionId}:${type}`,
        correction_type: type,
        correction_of_event_id: original.id,
        event_metadata: JSON.stringify({ correctionRequestId: correctionId }),
        immutable_hash: this.immutableHash(payload),
      },
    });
    await tx.usageRecord.create({
      data: {
        tenant_id: original.tenant_id,
        environment_id: original.environment_id,
        meter_definition_id: original.meter_definition_id,
        meter_authorization_id: original.meter_authorization_id,
        usage_authorization_id: original.usage_authorization_id,
        contract_id: original.contract_id,
        meter_version: `definition:${original.meter_definition_id}`,
        source_type: 'CONTROLLED_CORRECTION',
        raw_event_id: event.id,
        unit: original.unit,
        accepted_quantity: acceptedQuantity,
        billable_quantity: billableQuantity,
        overage_quantity: overageQuantity,
        usage_state: 'CORRECTION',
        usage_classification: `APPROVED_${type}`,
        immutable_hash: this.immutableHash({ ...payload, eventId: event.id }),
        occurred_at: event.occurred_at,
      },
    });
    return event;
  }

  async decideCorrection(
    id: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    dto: DecideMeterGovernanceDto,
  ) {
    const correction = await this.prisma.meterCorrectionRequest.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!correction)
      throw new NotFoundException(`Meter correction '${id}' not found`);
    if (correction.status !== 'PENDING_APPROVAL' || !correction.approval_id) {
      throw new ConflictException(
        `Meter correction '${id}' has no pending linked approval`,
      );
    }
    await this.approvals.decideApproval(
      correction.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    if (dto.decision === 'REJECTED') {
      return this.prisma.meterCorrectionRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
    }
    const original = await this.prisma.meterEvent.findUniqueOrThrow({
      where: { id: correction.original_event_id },
    });
    const originalUsage = await this.prisma.usageRecord.findFirst({
      where: { raw_event_id: original.id },
    });
    const accepted = originalUsage?.accepted_quantity ?? original.quantity;
    const billable = originalUsage?.billable_quantity ?? 0;
    const overage = originalUsage?.overage_quantity ?? 0;
    return this.prisma.$transaction(async (tx) => {
      const generated = [];
      if (
        correction.correction_type === 'REVERSAL' ||
        correction.correction_type === 'REPLACEMENT'
      ) {
        generated.push(
          await this.appendCorrectionEvent(
            tx,
            original,
            correction.id,
            'REVERSAL',
            -original.quantity,
            -accepted,
            -billable,
            -overage,
          ),
        );
      }
      if (correction.correction_type === 'REPLACEMENT') {
        const replacement = correction.replacement_quantity ?? 0;
        const ratio =
          original.quantity === 0 ? 0 : replacement / original.quantity;
        generated.push(
          await this.appendCorrectionEvent(
            tx,
            original,
            correction.id,
            'REPLACEMENT',
            replacement,
            replacement,
            Math.round(billable * ratio),
            Math.round(overage * ratio),
          ),
        );
      }
      if (correction.correction_type === 'ADJUSTMENT') {
        const adjustment = correction.adjustment_quantity ?? 0;
        const billableAdjustment =
          accepted === 0 ? 0 : Math.round(adjustment * (billable / accepted));
        const overageAdjustment =
          accepted === 0 ? 0 : Math.round(adjustment * (overage / accepted));
        generated.push(
          await this.appendCorrectionEvent(
            tx,
            original,
            correction.id,
            'ADJUSTMENT',
            adjustment,
            adjustment,
            billableAdjustment,
            overageAdjustment,
          ),
        );
      }
      const updated = await tx.meterCorrectionRequest.update({
        where: { id },
        data: {
          status: 'APPLIED',
          approved_by: approverId,
          approved_at: new Date(),
          applied_at: new Date(),
          generated_event_ids: JSON.stringify(
            generated.map((event) => event.id),
          ),
        },
      });
      await tx.commercialApproval.update({
        where: { id: correction.approval_id! },
        data: { status: 'APPLIED', applied_at: new Date() },
      });
      return updated;
    });
  }

  async createBillingExport(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateMeterBillingExportDto,
  ) {
    const policy = await this.requirePolicy(
      dto.meterAuthorizationId,
      tenantId,
      environmentId,
    );
    if (policy.status !== 'APPROVED')
      throw new ConflictException(
        'Billing exports require an APPROVED meter policy',
      );
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('periodEnd must be later than periodStart');
    }
    const canonicalPeriod = this.periodBounds(start, policy.billing_period);
    if (
      canonicalPeriod.start.getTime() !== start.getTime() ||
      canonicalPeriod.end.getTime() !== end.getTime()
    ) {
      throw new BadRequestException(
        `Billing export dates must be one complete ${policy.billing_period} policy period`,
      );
    }
    if (dto.supersedesId) {
      const prior = await this.prisma.meterBillingExport.findFirst({
        where: {
          id: dto.supersedesId,
          tenant_id: tenantId,
          environment_id: environmentId,
          meter_authorization_id: policy.id,
          period_start: start,
          period_end: end,
          status: 'APPROVED',
        },
      });
      if (!prior)
        throw new ConflictException(
          'supersedesId must reference an approved tenant billing export',
        );
    } else {
      const existing = await this.prisma.meterBillingExport.findFirst({
        where: {
          meter_authorization_id: policy.id,
          period_start: start,
          period_end: end,
          status: { in: ['PENDING_APPROVAL', 'APPROVED'] },
        },
      });
      if (existing) {
        throw new ConflictException(
          `Billing export '${existing.id}' already covers this policy period; regeneration must supersede it`,
        );
      }
    }
    if (dto.correctionRequestId) {
      const correction = await this.prisma.meterCorrectionRequest.findFirst({
        where: {
          id: dto.correctionRequestId,
          tenant_id: tenantId,
          environment_id: environmentId,
          status: 'APPLIED',
        },
      });
      if (!correction || !dto.supersedesId) {
        throw new ConflictException(
          'Correction regeneration requires an applied correction and supersedesId',
        );
      }
    }
    const usageCandidates = await this.prisma.usageRecord.findMany({
      where: {
        meter_authorization_id: policy.id,
        occurred_at: { gte: start, lt: end },
      },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
    });
    const policyEvents = await this.prisma.meterEvent.findMany({
      where: {
        meter_authorization_id: policy.id,
        occurred_at: { gte: start, lt: end },
      },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
    });
    const eventById = new Map(policyEvents.map((event) => [event.id, event]));
    const evaluatedUsage = usageCandidates.map((record) => ({
      record,
      event: record.raw_event_id
        ? eventById.get(record.raw_event_id)
        : undefined,
      exclusionReason: this.exportExclusionReason(
        record,
        record.raw_event_id ? eventById.get(record.raw_event_id) : undefined,
        policy,
      ),
    }));
    const invalidBillable = evaluatedUsage.find(
      ({ record, exclusionReason }) =>
        exclusionReason && record.billable_quantity !== 0,
    );
    if (invalidBillable) {
      throw new ConflictException({
        statusCode: 409,
        error: 'FAILED_INGESTION_BILLING_ATTEMPT',
        message: `Usage record '${invalidBillable.record.id}' has billable quantity without accepted, validated, deduplicated evidence (${invalidBillable.exclusionReason})`,
      });
    }
    const usage = evaluatedUsage
      .filter((item) => !item.exclusionReason && !!item.event)
      .map(({ record }) => record);
    const includedEventIds = new Set(
      usage.map((record) => record.raw_event_id).filter(Boolean) as string[],
    );
    const events = policyEvents.filter((event) =>
      includedEventIds.has(event.id),
    );
    const excludedEventIds = policyEvents
      .filter((event) => !includedEventIds.has(event.id))
      .map((event) => event.id);
    const totals = usage.reduce(
      (sum, item) => ({
        accepted: sum.accepted + item.accepted_quantity,
        billable: sum.billable + item.billable_quantity,
        overage: sum.overage + item.overage_quantity,
      }),
      { accepted: 0, billable: 0, overage: 0 },
    );
    const snapshot = {
      tenantId,
      environmentId,
      contractId: policy.contract_id,
      meterAuthorizationId: policy.id,
      meterDefinitionId: policy.meter_definition_id,
      meterVersion: policy.meterDefinition.version,
      unit: policy.meterDefinition.unit,
      billingBasis: 'ACCEPTED_DATA_USAGE',
      pricingModel: policy.pricing_model,
      committedQuantity: policy.committed_quantity,
      committedCapacityChargeIncluded: false,
      eligibilityRule:
        'ACCEPTED_VALID_UNIQUE_CONTRACT_AUTHORIZED_EVIDENCE_ONLY',
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      eventHashes: events.map((event) => ({
        id: event.id,
        hash: event.immutable_hash,
      })),
      usageHashes: usage.map((item) => ({
        id: item.id,
        hash: item.immutable_hash,
      })),
      excludedEventIds,
      excludedUsage: evaluatedUsage
        .filter((item) => item.exclusionReason)
        .map((item) => ({
          usageRecordId: item.record.id,
          rawEventId: item.record.raw_event_id,
          reason: item.exclusionReason,
        })),
      totals,
      supersedesId: dto.supersedesId ?? null,
      correctionRequestId: dto.correctionRequestId ?? null,
    };
    const immutableSnapshot = this.stable(snapshot);
    const checksum = createHash('sha256')
      .update(immutableSnapshot)
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const billingExport = await (tx as any).meterBillingExport.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          meter_authorization_id: policy.id,
          contract_id: policy.contract_id,
          period_start: start,
          period_end: end,
          meter_definition_id: policy.meter_definition_id,
          meter_version: policy.meterDefinition.version,
          event_ids: JSON.stringify(events.map((event) => event.id)),
          usage_record_ids: JSON.stringify(usage.map((item) => item.id)),
          accepted_quantity: totals.accepted,
          billable_quantity: totals.billable,
          overage_quantity: totals.overage,
          billing_basis: 'ACCEPTED_DATA_USAGE',
          excluded_event_ids: JSON.stringify(excludedEventIds),
          committed_capacity_included: false,
          immutable_snapshot: immutableSnapshot,
          checksum,
          reason: dto.reason.trim(),
          requested_by: requestedBy,
          supersedes_id: dto.supersedesId,
          correction_request_id: dto.correctionRequestId,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'METER_BILLING_EXPORT',
          objectType: 'MeterBillingExport',
          objectId: billingExport.id,
          tenantId,
          requestedBy,
          reason: dto.reason,
          proposedSnapshot: { checksum, totals, ...dto },
          requiredApprovalRole: 'BILLING_ADMIN',
        },
        tx,
      );
      return tx.meterBillingExport.update({
        where: { id: billingExport.id },
        data: { approval_id: approval.id },
      });
    });
  }

  listBillingExports(tenantId: string, environmentId: string) {
    return this.prisma.meterBillingExport.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { created_at: 'desc' },
    });
  }

  async decideBillingExport(
    id: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    dto: DecideMeterGovernanceDto,
  ) {
    const billingExport = await this.prisma.meterBillingExport.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!billingExport)
      throw new NotFoundException(`Meter billing export '${id}' not found`);
    const policy = await this.prisma.meterAuthorizationPolicy.findFirst({
      where: {
        id: billingExport.meter_authorization_id,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
    });
    if (
      billingExport.status !== 'PENDING_APPROVAL' ||
      !billingExport.approval_id
    ) {
      throw new ConflictException(
        `Billing export '${id}' has no pending linked approval`,
      );
    }
    if (dto.decision === 'APPROVED') {
      const expected = createHash('sha256')
        .update(billingExport.immutable_snapshot)
        .digest('hex');
      if (expected !== billingExport.checksum) {
        throw new ConflictException(
          'Billing export snapshot checksum mismatch',
        );
      }
      const reconciliation = await this.reconcileBillingExport(
        id,
        tenantId,
        environmentId,
      );
      if (reconciliation.status !== 'MATCHED') {
        throw new ConflictException(
          'Billing export does not reconcile to its immutable usage evidence',
        );
      }
    }
    await this.approvals.decideApproval(
      billingExport.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.meterBillingExport.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'APPROVED',
                approved_by: approverId,
                approved_at: new Date(),
              }
            : { status: 'REJECTED' },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: billingExport.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async reconcileBillingExport(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const billingExport = await this.prisma.meterBillingExport.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!billingExport)
      throw new NotFoundException(`Meter billing export '${id}' not found`);
    const policy = await this.prisma.meterAuthorizationPolicy.findFirst({
      where: {
        id: billingExport.meter_authorization_id,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
    });
    const checksumValid =
      createHash('sha256')
        .update(billingExport.immutable_snapshot)
        .digest('hex') === billingExport.checksum;
    const usageIds = this.parseStringArray(billingExport.usage_record_ids);
    const eventIds = this.parseStringArray(billingExport.event_ids);
    const usage = await this.prisma.usageRecord.findMany({
      where: { id: { in: usageIds } },
    });
    const events = await this.prisma.meterEvent.findMany({
      where: { id: { in: eventIds } },
    });
    const policy = await this.prisma.meterAuthorizationPolicy.findFirst({
      where: { id: billingExport.meter_authorization_id },
    });
    let snapshotHashes: {
      eventHashes?: Array<{ id: string; hash: string }>;
      usageHashes?: Array<{ id: string; hash: string }>;
      billingBasis?: string;
      pricingModel?: string;
      committedQuantity?: number | null;
      committedCapacityChargeIncluded?: boolean;
      excludedEventIds?: string[];
    } = {};
    try {
      snapshotHashes = JSON.parse(
        billingExport.immutable_snapshot,
      ) as typeof snapshotHashes;
    } catch {
      snapshotHashes = {};
    }
    const expectedEventHashes = new Map(
      (snapshotHashes.eventHashes ?? []).map((item) => [item.id, item.hash]),
    );
    const expectedUsageHashes = new Map(
      (snapshotHashes.usageHashes ?? []).map((item) => [item.id, item.hash]),
    );
    const evidenceHashesValid =
      events.length === eventIds.length &&
      usage.length === usageIds.length &&
      events.every(
        (event) => expectedEventHashes.get(event.id) === event.immutable_hash,
      ) &&
      usage.every(
        (record) =>
          expectedUsageHashes.get(record.id) === record.immutable_hash,
      );
    const eventById = new Map(events.map((event) => [event.id, event]));
    const ingestionEligibilityValid =
      !!policy &&
      usage.every(
        (record) =>
          !this.exportExclusionReason(
            record,
            record.raw_event_id
              ? eventById.get(record.raw_event_id)
              : undefined,
            policy,
          ),
      ) &&
      events.every((event) =>
        usage.some((record) => record.raw_event_id === event.id),
      );
    const be = billingExport as any;
    const commercialSeparationValid =
      be.billing_basis === 'ACCEPTED_DATA_USAGE' &&
      !be.committed_capacity_included &&
      snapshotHashes.billingBasis === 'ACCEPTED_DATA_USAGE' &&
      snapshotHashes.committedCapacityChargeIncluded === false &&
      snapshotHashes.pricingModel === policy?.pricing_model &&
      snapshotHashes.committedQuantity === policy?.committed_quantity;
    const totals = usage.reduce(
      (sum, item) => ({
        accepted: sum.accepted + item.accepted_quantity,
        billable: sum.billable + item.billable_quantity,
        overage: sum.overage + item.overage_quantity,
      }),
      { accepted: 0, billable: 0, overage: 0 },
    );
    const quantityValid =
      evidenceHashesValid &&
      totals.accepted === billingExport.accepted_quantity &&
      totals.billable === billingExport.billable_quantity &&
      totals.overage === billingExport.overage_quantity;
    return {
      exportId: id,
      status:
        checksumValid &&
        evidenceHashesValid &&
        ingestionEligibilityValid &&
        commercialSeparationValid &&
        quantityValid
          ? 'MATCHED'
          : 'MISMATCH',
      checksumValid,
      evidenceHashesValid,
      ingestionEligibilityValid,
      commercialSeparationValid,
      quantityValid,
      expected: {
        eventCount: eventIds.length,
        usageRecordCount: usageIds.length,
        acceptedQuantity: billingExport.accepted_quantity,
        billableQuantity: billingExport.billable_quantity,
        overageQuantity: billingExport.overage_quantity,
      },
      actual: {
        eventCount: events.length,
        usageRecordCount: usage.length,
        ...totals,
      },
    };
  }
}
