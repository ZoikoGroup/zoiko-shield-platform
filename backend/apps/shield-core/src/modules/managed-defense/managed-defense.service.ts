import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { createHash } from 'crypto';
import type { ManagedDefenseProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const COVERAGE_WINDOWS = ['BUSINESS_HOURS', 'EXTENDED', '24X7'] as const;
const RESPONSE_AUTHORITIES = ['R0', 'R1', 'R2', 'R3', 'R4'] as const;
const DELIVERY_EVENT_TYPES = [
  'CASE_ACTIVITY',
  'ANALYST_ACTION',
  'CUSTOMER_NOTIFICATION',
  'SLA_CLOCK',
  'ESCALATION',
  'OBLIGATION_STATUS',
  'CAPACITY_EXCEPTION',
  'POST_INCIDENT_RECONCILIATION',
] as const;

export class CreateManagedDefenseProfileDto {
  @IsString()
  profileKey!: string;

  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  contractId!: string;

  @IsString()
  serviceTier!: string;

  @IsIn([
    'PROTECTED_RESOURCE_SERVICE_TIER',
    'COMMITTED_ENVIRONMENT_SERVICE_TIER',
  ])
  recurringPricingMetric!:
    'PROTECTED_RESOURCE_SERVICE_TIER' | 'COMMITTED_ENVIRONMENT_SERVICE_TIER';

  @IsUUID()
  priceBookId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  protectedScopePolicyIds!: string[];

  @IsObject()
  technologyScope!: Record<string, unknown>;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  meterPolicyIds!: string[];

  @IsIn(COVERAGE_WINDOWS)
  coverageWindow!: (typeof COVERAGE_WINDOWS)[number];

  @IsObject()
  triageScope!: Record<string, unknown>;

  @IsObject()
  investigationScope!: Record<string, unknown>;

  @IsObject()
  escalationPolicy!: Record<string, unknown>;

  @IsObject()
  responseSupport!: Record<string, unknown>;

  @IsIn(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'])
  reviewCadence!: string;

  @IsArray()
  @IsString({ each: true })
  customerDependencies!: string[];

  @IsArray()
  @IsString({ each: true })
  exclusions!: string[];

  @IsIn(RESPONSE_AUTHORITIES)
  responseAuthority!: (typeof RESPONSE_AUTHORITIES)[number];

  @IsOptional()
  @IsString()
  technicalCertificationRef?: string;

  @IsOptional()
  @IsString()
  customerAuthorizationRef?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  creditEligibleCapabilities?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  slaDefinitionIds?: string[];

  @IsISO8601()
  effectiveFrom!: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;

  @IsString()
  reason!: string;
}

export class DecideManagedDefenseDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class VerifyManagedDefenseReadinessDto {
  @IsBoolean()
  staffingReady!: boolean;

  @IsBoolean()
  onCallReady!: boolean;

  @IsBoolean()
  escalationReady!: boolean;

  @IsBoolean()
  runbooksReady!: boolean;

  @IsBoolean()
  measuredPerformanceReady!: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  staffingEvidenceRefs!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  onCallEvidenceRefs!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  escalationEvidenceRefs!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  runbookEvidenceRefs!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  performanceEvidenceRefs!: string[];
}

export class RecordManagedDefenseDeliveryDto {
  @IsUUID()
  managedDefenseProfileId!: string;

  @IsOptional()
  @IsUUID()
  serviceObligationId?: string;

  @IsIn(DELIVERY_EVENT_TYPES)
  eventType!: (typeof DELIVERY_EVENT_TYPES)[number];

  @IsString()
  sourceReference!: string;

  @IsString()
  evidenceReference!: string;

  @IsString()
  actorId!: string;

  @IsISO8601()
  occurredAt!: Date;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

export class OpenCapacityExceptionDto {
  @IsUUID()
  managedDefenseProfileId!: string;

  @IsInt()
  @IsPositive()
  currentVolume!: number;

  @IsInt()
  @IsPositive()
  forecastVolume!: number;

  @IsString()
  capacityBasis!: string;

  @IsString()
  reason!: string;

  @IsIn([
    'INCLUDED_FAIR_USE',
    'APPROVED_THIRD_PARTY',
    'CUSTOMER_AUTHORIZED_PAID_WORK',
    'POST_INCIDENT_RECONCILIATION',
  ])
  overflowPolicy!: string;

  @IsOptional()
  @IsString()
  namedCustomerAuthorizer?: string;

  @IsOptional()
  @IsString()
  customerAuthorizationRef?: string;

  @IsOptional()
  @IsISO8601()
  customerAuthorizedAt?: Date;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  estimatedThirdPartyCost?: number;
}

export class ReconcileCapacityExceptionDto {
  @IsObject()
  reconciliation!: Record<string, unknown>;

  @IsString()
  evidenceReference!: string;
}

export class RecordCapabilityImpactDto {
  @IsUUID()
  managedDefenseProfileId!: string;

  @IsString()
  capabilityKey!: string;

  @IsString()
  affectedScope!: string;

  @IsOptional()
  @IsString()
  connectorReference?: string;

  @IsIn([
    'SUPPORTED_CONNECTOR_FAILURE',
    'UNSUPPORTED_CONNECTOR',
    'CUSTOMER_ACCESS_LOSS',
    'THIRD_PARTY_OUTAGE',
    'EXCLUDED_SERVICE_WINDOW',
  ])
  failureType!: string;

  @IsOptional()
  @IsUUID()
  slaDefinitionId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  evidenceRefs!: string[];

  @IsString()
  recordedBy!: string;

  @IsISO8601()
  occurredAt!: Date;
}

@Injectable()
export class ManagedDefenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

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

  private parseObject(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
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

  private hash(value: unknown) {
    return createHash('sha256').update(this.stable(value)).digest('hex');
  }

  private nonEmpty(values: string[], field: string) {
    const normalized = [...new Set(values.map((value) => value.trim()))].filter(
      Boolean,
    );
    if (
      normalized.length !== values.length &&
      values.some((value) => !value.trim())
    ) {
      throw new BadRequestException(`${field} contains an empty value`);
    }
    return normalized;
  }

  private async requireProfile(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const profile = await this.prisma.managedDefenseProfile.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
      include: { contract: true, readiness: true },
    });
    if (!profile) {
      throw new NotFoundException(`Managed Defense profile '${id}' not found`);
    }
    return profile;
  }

  listProfiles(tenantId: string, environmentId: string) {
    return this.prisma.managedDefenseProfile.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      include: { readiness: true },
      orderBy: [{ profile_key: 'asc' }, { version: 'desc' }],
    });
  }

  getProfile(id: string, tenantId: string, environmentId: string) {
    return this.requireProfile(id, tenantId, environmentId);
  }

  async createProfile(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateManagedDefenseProfileDto,
  ) {
    const profileKey = dto.profileKey.trim();
    const serviceTier = dto.serviceTier.trim();
    const reason = dto.reason.trim();
    if (!profileKey || !serviceTier || !reason) {
      throw new BadRequestException(
        'profileKey, serviceTier and reason must be non-empty',
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
    const responseLevel = Number(dto.responseAuthority.slice(1));
    if (
      responseLevel >= 2 &&
      (!dto.technicalCertificationRef?.trim() ||
        !dto.customerAuthorizationRef?.trim())
    ) {
      throw new BadRequestException(
        'R2-R4 authority requires technical certification and named customer authorization',
      );
    }
    const technologyArray = (field: string) =>
      Array.isArray(dto.technologyScope[field])
        ? (dto.technologyScope[field] as unknown[]).filter(
            (item): item is string => typeof item === 'string' && !!item.trim(),
          )
        : [];
    const offerTypes = technologyArray('offerTypes');
    const technologyCapabilities = technologyArray('capabilities');
    const connectors = technologyArray('connectors');
    const responseTools = technologyArray('responseTools');
    const releaseScope =
      typeof dto.technologyScope.releaseScope === 'string'
        ? dto.technologyScope.releaseScope.trim()
        : '';
    if (!offerTypes.length) {
      throw new BadRequestException(
        'technologyScope.offerTypes must declare at least one entitled offer',
      );
    }
    const requiredCapabilities = ['DETECTIONS', 'CASES', 'EVIDENCE'];
    const declaredCapabilities = new Set(
      technologyCapabilities.map((capability) => capability.toUpperCase()),
    );
    if (
      requiredCapabilities.some(
        (capability) => !declaredCapabilities.has(capability),
      ) ||
      connectors.length === 0 ||
      responseTools.length === 0 ||
      !releaseScope
    ) {
      throw new BadRequestException(
        'technologyScope must define detections, cases, evidence, approved connectors, responseTools and releaseScope',
      );
    }
    if (dto.responseSupport.authority !== dto.responseAuthority) {
      throw new BadRequestException(
        'responseSupport.authority must match responseAuthority',
      );
    }
    const protectedScopePolicyIds = [...new Set(dto.protectedScopePolicyIds)];
    const meterPolicyIds = [...new Set(dto.meterPolicyIds)];
    if (protectedScopePolicyIds.length === 0 || meterPolicyIds.length === 0) {
      throw new BadRequestException(
        'Managed Defense requires protected scope and included telemetry/retention meter policies',
      );
    }
    const creditCapabilities = this.nonEmpty(
      dto.creditEligibleCapabilities ?? [],
      'creditEligibleCapabilities',
    );
    const slaDefinitionIds = [...new Set(dto.slaDefinitionIds ?? [])];

    const [
      contract,
      binding,
      price,
      coveragePolicies,
      meterPolicies,
      entitlements,
      slas,
    ] = await Promise.all([
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
      this.prisma.priceBook.findUnique({ where: { id: dto.priceBookId } }),
      this.prisma.resourceCoveragePolicy.findMany({
        where: {
          id: { in: protectedScopePolicyIds },
          tenant_id: tenantId,
          environment_id: environmentId,
          status: 'APPROVED',
          effective_from: { lte: effectiveFrom },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveTo ?? effectiveFrom } },
          ],
        },
      }),
      this.prisma.meterAuthorizationPolicy.findMany({
        where: {
          id: { in: meterPolicyIds },
          tenant_id: tenantId,
          environment_id: environmentId,
          contract_id: dto.contractId,
          status: 'APPROVED',
          effective_from: { lte: effectiveFrom },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveTo ?? effectiveFrom } },
          ],
        },
      }),
      this.prisma.entitlement.findMany({
        where: {
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          offer_type: { in: offerTypes },
          status: 'ACTIVE',
          effective_from: { lte: effectiveFrom },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveTo ?? effectiveFrom } },
          ],
        },
      }),
      this.prisma.slaDefinition.findMany({
        where: {
          id: { in: slaDefinitionIds },
          status: 'APPROVED',
          service_tier: serviceTier,
          effective_from: { lte: effectiveFrom },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveTo ?? effectiveFrom } },
          ],
        },
      }),
    ]);
    if (
      !contract ||
      contract.status !== 'ACTIVE' ||
      contract.commercial_account_id !== dto.commercialAccountId
    ) {
      throw new ConflictException(
        'Managed Defense requires the matching ACTIVE contract',
      );
    }
    if (!binding) {
      throw new ConflictException(
        'Commercial account is not actively bound to this tenant environment',
      );
    }
    if (
      effectiveFrom < contract.term_start ||
      (effectiveTo ?? contract.term_end) > contract.term_end
    ) {
      throw new ConflictException(
        'Managed Defense dates must fit inside the contract term',
      );
    }
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
        'priceBookId must be an approved contract-compatible service price',
      );
    }
    if (coveragePolicies.length !== protectedScopePolicyIds.length) {
      throw new ConflictException(
        'Every protected scope policy must be approved for this tenant environment',
      );
    }
    if (meterPolicies.length !== meterPolicyIds.length) {
      throw new ConflictException(
        'Every data meter policy must be approved under this contract',
      );
    }
    const incompleteDataPolicies = meterPolicies.filter((policy) => {
      const sourceScope = this.parseArray(policy.authorized_source_scope);
      const retention = this.parseObject(policy.retention_policy);
      const disclosure = this.parseObject(policy.visible_customer_policy);
      return (
        sourceScope.length === 0 ||
        Object.keys(retention).length === 0 ||
        Object.keys(disclosure).length === 0
      );
    });
    if (incompleteDataPolicies.length) {
      throw new ConflictException(
        'Managed Defense data policies must disclose included telemetry, retention and customer-visible overage treatment',
      );
    }
    const entitledOffers = new Set(entitlements.map((item) => item.offer_type));
    const missingOffers = offerTypes.filter(
      (offer) => !entitledOffers.has(offer),
    );
    if (missingOffers.length) {
      throw new ConflictException(
        `Managed Defense technology scope is not entitled: ${missingOffers.join(', ')}`,
      );
    }
    if (
      slas.length !== slaDefinitionIds.length ||
      (creditCapabilities.length > 0 && slaDefinitionIds.length === 0)
    ) {
      throw new ConflictException(
        'Credit-eligible capabilities require approved SLA definitions for the same service tier',
      );
    }

    const overlapping = await this.prisma.managedDefenseProfile.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        contract_id: contract.id,
        status: { in: ['PENDING_APPROVAL', 'PENDING_READINESS', 'ACTIVE'] },
        effective_from: { lt: effectiveTo ?? contract.term_end },
        OR: [{ effective_to: null }, { effective_to: { gt: effectiveFrom } }],
      },
    });
    if (overlapping) {
      throw new ConflictException(
        `Managed Defense profile '${overlapping.id}' already covers this contract window`,
      );
    }
    const latest = await this.prisma.managedDefenseProfile.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        profile_key: profileKey,
      },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const dependencies = this.nonEmpty(
      dto.customerDependencies,
      'customerDependencies',
    );
    const exclusions = this.nonEmpty(dto.exclusions, 'exclusions');

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.managedDefenseProfile.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          commercial_account_id: dto.commercialAccountId,
          contract_id: dto.contractId,
          profile_key: profileKey,
          version,
          service_tier: serviceTier,
          recurring_pricing_metric: dto.recurringPricingMetric,
          price_book_id: dto.priceBookId,
          protected_scope_policy_ids: JSON.stringify(protectedScopePolicyIds),
          technology_scope: JSON.stringify(dto.technologyScope),
          meter_policy_ids: JSON.stringify(meterPolicyIds),
          coverage_window: dto.coverageWindow,
          triage_scope: JSON.stringify(dto.triageScope),
          investigation_scope: JSON.stringify(dto.investigationScope),
          escalation_policy: JSON.stringify(dto.escalationPolicy),
          response_support: JSON.stringify(dto.responseSupport),
          review_cadence: dto.reviewCadence,
          customer_dependencies: JSON.stringify(dependencies),
          exclusions: JSON.stringify(exclusions),
          response_authority: dto.responseAuthority,
          technical_certification_ref: dto.technicalCertificationRef?.trim(),
          customer_authorization_ref: dto.customerAuthorizationRef?.trim(),
          credit_eligible_capabilities: JSON.stringify(creditCapabilities),
          sla_definition_ids: JSON.stringify(slaDefinitionIds),
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'MANAGED_DEFENSE_PROFILE',
          objectType: 'ManagedDefenseProfile',
          objectId: profile.id,
          tenantId,
          requestedBy,
          reason,
          proposedSnapshot: {
            ...dto,
            profileKey,
            version,
            serviceTier,
            entitledOffers: offerTypes,
            protectedScopePolicyIds,
            meterPolicyIds,
            slaDefinitionIds,
          },
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
          expiresAt: effectiveTo,
        },
        tx,
      );
      return tx.managedDefenseProfile.update({
        where: { id: profile.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async decideProfile(
    id: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    dto: DecideManagedDefenseDto,
  ) {
    const profile = await this.requireProfile(id, tenantId, environmentId);
    if (profile.status !== 'PENDING_APPROVAL' || !profile.approval_id) {
      throw new ConflictException(
        `Managed Defense profile '${id}' has no pending approval`,
      );
    }
    await this.approvals.decideApproval(
      profile.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.managedDefenseProfile.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'PENDING_READINESS',
                approved_by: approverId,
                approved_at: new Date(),
              }
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

  async verifyReadiness(
    id: string,
    tenantId: string,
    environmentId: string,
    verifiedBy: string,
    dto: VerifyManagedDefenseReadinessDto,
  ) {
    const profile = await this.requireProfile(id, tenantId, environmentId);
    if (profile.status !== 'PENDING_READINESS') {
      throw new ConflictException(
        `Managed Defense readiness cannot be verified while profile is '${profile.status}'`,
      );
    }
    if (
      profile.requested_by === verifiedBy ||
      profile.approved_by === verifiedBy
    ) {
      throw new ForbiddenException(
        'Readiness verifier must be independent of profile request and commercial approval',
      );
    }
    const ready =
      dto.staffingReady &&
      dto.onCallReady &&
      dto.escalationReady &&
      dto.runbooksReady &&
      dto.measuredPerformanceReady;
    const evidenceSets = [
      dto.staffingEvidenceRefs,
      dto.onCallEvidenceRefs,
      dto.escalationEvidenceRefs,
      dto.runbookEvidenceRefs,
      dto.performanceEvidenceRefs,
    ];
    if (
      !ready ||
      evidenceSets.some(
        (refs) => refs.length === 0 || refs.some((ref) => !ref.trim()),
      )
    ) {
      throw new ConflictException(
        `${profile.coverage_window} cannot activate until staffing, on-call, escalation, runbooks and measured performance are all evidenced`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const assessment = await tx.managedDefenseReadinessAssessment.upsert({
        where: { managed_defense_profile_id: id },
        create: {
          tenant_id: tenantId,
          environment_id: environmentId,
          managed_defense_profile_id: id,
          staffing_ready: true,
          on_call_ready: true,
          escalation_ready: true,
          runbooks_ready: true,
          measured_performance_ready: true,
          staffing_evidence_refs: JSON.stringify(dto.staffingEvidenceRefs),
          on_call_evidence_refs: JSON.stringify(dto.onCallEvidenceRefs),
          escalation_evidence_refs: JSON.stringify(dto.escalationEvidenceRefs),
          runbook_evidence_refs: JSON.stringify(dto.runbookEvidenceRefs),
          performance_evidence_refs: JSON.stringify(
            dto.performanceEvidenceRefs,
          ),
          status: 'VERIFIED',
          verified_by: verifiedBy,
          verified_at: new Date(),
        },
        update: {
          staffing_ready: true,
          on_call_ready: true,
          escalation_ready: true,
          runbooks_ready: true,
          measured_performance_ready: true,
          staffing_evidence_refs: JSON.stringify(dto.staffingEvidenceRefs),
          on_call_evidence_refs: JSON.stringify(dto.onCallEvidenceRefs),
          escalation_evidence_refs: JSON.stringify(dto.escalationEvidenceRefs),
          runbook_evidence_refs: JSON.stringify(dto.runbookEvidenceRefs),
          performance_evidence_refs: JSON.stringify(
            dto.performanceEvidenceRefs,
          ),
          status: 'VERIFIED',
          verified_by: verifiedBy,
          verified_at: new Date(),
        },
      });
      const activated = await tx.managedDefenseProfile.update({
        where: { id },
        data: { status: 'ACTIVE', activated_at: new Date() },
      });
      return { profile: activated, readiness: assessment };
    });
  }

  async recordDelivery(
    tenantId: string,
    environmentId: string,
    dto: RecordManagedDefenseDeliveryDto,
    transaction?: Prisma.TransactionClient,
  ) {
    const sourceReference = dto.sourceReference.trim();
    const evidenceReference = dto.evidenceReference.trim();
    const actorId = dto.actorId.trim();
    const occurredAt = new Date(dto.occurredAt);
    if (
      !sourceReference ||
      !evidenceReference ||
      !actorId ||
      Number.isNaN(occurredAt.getTime())
    ) {
      throw new BadRequestException(
        'Delivery source, evidence, actor and occurredAt must be valid and non-empty',
      );
    }
    const profile = await this.requireProfile(
      dto.managedDefenseProfileId,
      tenantId,
      environmentId,
    );
    if (profile.status !== 'ACTIVE') {
      throw new ConflictException(
        'Delivery evidence requires an ACTIVE, readiness-verified profile',
      );
    }
    if (dto.serviceObligationId) {
      const obligation = await this.prisma.serviceObligation.findFirst({
        where: {
          id: dto.serviceObligationId,
          managed_defense_profile_id: profile.id,
          tenant_id: tenantId,
          environment_id: environmentId,
        },
      });
      if (!obligation) {
        throw new NotFoundException(
          `Service obligation '${dto.serviceObligationId}' not found under this profile`,
        );
      }
    }
    const payload = {
      tenantId,
      environmentId,
      profileId: profile.id,
      obligationId: dto.serviceObligationId ?? null,
      eventType: dto.eventType,
      sourceReference,
      evidenceReference,
      actorId,
      occurredAt: occurredAt.toISOString(),
      details: dto.details ?? {},
    };
    const client = transaction ?? this.prisma;
    return client.managedDefenseDeliveryEvent.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        managed_defense_profile_id: profile.id,
        service_obligation_id: dto.serviceObligationId,
        event_type: dto.eventType,
        source_reference: sourceReference,
        evidence_reference: evidenceReference,
        actor_id: actorId,
        occurred_at: occurredAt,
        details: JSON.stringify(dto.details ?? {}),
        immutable_hash: this.hash(payload),
      },
    });
  }

  listDeliveryEvents(
    profileId: string,
    tenantId: string,
    environmentId: string,
  ) {
    return this.prisma.managedDefenseDeliveryEvent.findMany({
      where: {
        managed_defense_profile_id: profileId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
      orderBy: { occurred_at: 'desc' },
    });
  }

  async deliverySummary(
    profileId: string,
    tenantId: string,
    environmentId: string,
  ) {
    const profile = await this.requireProfile(
      profileId,
      tenantId,
      environmentId,
    );
    const [events, obligations, capacityExceptions, capabilityImpacts] =
      await Promise.all([
        this.prisma.managedDefenseDeliveryEvent.findMany({
          where: { managed_defense_profile_id: profileId },
          orderBy: { occurred_at: 'desc' },
        }),
        this.prisma.serviceObligation.findMany({
          where: { managed_defense_profile_id: profileId },
          orderBy: { created_at: 'desc' },
        }),
        this.prisma.managedDefenseCapacityException.findMany({
          where: { managed_defense_profile_id: profileId },
          orderBy: { opened_at: 'desc' },
        }),
        this.prisma.managedDefenseCapabilityImpact.findMany({
          where: { managed_defense_profile_id: profileId },
          orderBy: { occurred_at: 'desc' },
        }),
      ]);
    return {
      profile,
      reviewCadence: profile.review_cadence,
      events,
      obligations,
      capacityExceptions,
      capabilityImpacts,
    };
  }

  async openCapacityException(
    tenantId: string,
    environmentId: string,
    openedBy: string,
    dto: OpenCapacityExceptionDto,
  ) {
    const capacityBasis = dto.capacityBasis.trim();
    const reason = dto.reason.trim();
    if (
      !Number.isInteger(dto.currentVolume) ||
      dto.currentVolume <= 0 ||
      !Number.isInteger(dto.forecastVolume) ||
      dto.forecastVolume <= 0 ||
      !capacityBasis ||
      !reason
    ) {
      throw new BadRequestException(
        'Capacity volumes must be positive integers and basis/reason must be non-empty',
      );
    }
    const profile = await this.requireProfile(
      dto.managedDefenseProfileId,
      tenantId,
      environmentId,
    );
    if (profile.status !== 'ACTIVE') {
      throw new ConflictException(
        'Capacity exceptions require an ACTIVE Managed Defense profile',
      );
    }
    const paid = dto.overflowPolicy === 'CUSTOMER_AUTHORIZED_PAID_WORK';
    if (
      paid &&
      (!dto.namedCustomerAuthorizer?.trim() ||
        !dto.customerAuthorizationRef?.trim() ||
        !dto.customerAuthorizedAt ||
        !dto.estimatedThirdPartyCost)
    ) {
      throw new BadRequestException(
        'Emergency paid work requires a named customer authorizer, authorization reference/time and estimated cost',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const exception = await tx.managedDefenseCapacityException.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          managed_defense_profile_id: profile.id,
          current_volume: dto.currentVolume,
          forecast_volume: dto.forecastVolume,
          capacity_basis: capacityBasis,
          reason,
          event_processing_preserved: true,
          critical_response_preserved: true,
          overflow_policy: dto.overflowPolicy,
          named_customer_authorizer: dto.namedCustomerAuthorizer?.trim(),
          customer_authorization_ref: dto.customerAuthorizationRef?.trim(),
          customer_authorized_at: dto.customerAuthorizedAt
            ? new Date(dto.customerAuthorizedAt)
            : undefined,
          estimated_third_party_cost: dto.estimatedThirdPartyCost,
          paid_work_status: paid ? 'PENDING_APPROVAL' : 'NOT_APPLICABLE',
          opened_by: openedBy,
        },
      });
      let approvalId: string | undefined;
      if (paid) {
        const approval = await this.approvals.requestApproval(
          {
            changeType: 'MANAGED_DEFENSE_PAID_OVERFLOW',
            objectType: 'ManagedDefenseCapacityException',
            objectId: exception.id,
            tenantId,
            requestedBy: openedBy,
            reason: dto.reason,
            proposedSnapshot: {
              profileId: profile.id,
              overflowPolicy: dto.overflowPolicy,
              namedCustomerAuthorizer: dto.namedCustomerAuthorizer,
              customerAuthorizationRef: dto.customerAuthorizationRef,
              estimatedThirdPartyCost: dto.estimatedThirdPartyCost,
              securityHandling: 'CONTINUES_INDEPENDENTLY',
            },
            financialImpact: dto.estimatedThirdPartyCost,
            requiredApprovalRole: 'COMMERCIAL_APPROVER',
          },
          tx,
        );
        approvalId = approval.id;
      }
      const updated = approvalId
        ? await tx.managedDefenseCapacityException.update({
            where: { id: exception.id },
            data: { approval_id: approvalId },
          })
        : exception;
      await tx.managedDefenseDeliveryEvent.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          managed_defense_profile_id: profile.id,
          event_type: 'CAPACITY_EXCEPTION',
          source_reference: exception.id,
          evidence_reference: dto.customerAuthorizationRef ?? exception.id,
          actor_id: openedBy,
          occurred_at: new Date(),
          details: JSON.stringify({
            currentVolume: dto.currentVolume,
            forecastVolume: dto.forecastVolume,
            overflowPolicy: dto.overflowPolicy,
            eventProcessingPreserved: true,
            criticalResponsePreserved: true,
          }),
          immutable_hash: this.hash({
            exceptionId: exception.id,
            profileId: profile.id,
            securityHandling: 'PRESERVED',
            overflowPolicy: dto.overflowPolicy,
          }),
        },
      });
      return updated;
    });
  }

  listCapacityExceptions(tenantId: string, environmentId: string) {
    return this.prisma.managedDefenseCapacityException.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { opened_at: 'desc' },
    });
  }

  async decidePaidOverflow(
    id: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    dto: DecideManagedDefenseDto,
  ) {
    const exception =
      await this.prisma.managedDefenseCapacityException.findFirst({
        where: { id, tenant_id: tenantId, environment_id: environmentId },
      });
    if (
      !exception ||
      exception.paid_work_status !== 'PENDING_APPROVAL' ||
      !exception.approval_id
    ) {
      throw new ConflictException(
        `Capacity exception '${id}' has no pending paid-work approval`,
      );
    }
    await this.approvals.decideApproval(
      exception.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.managedDefenseCapacityException.update({
        where: { id },
        data: { paid_work_status: dto.decision },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: exception.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async reconcileCapacityException(
    id: string,
    tenantId: string,
    environmentId: string,
    reconciledBy: string,
    dto: ReconcileCapacityExceptionDto,
  ) {
    const exception =
      await this.prisma.managedDefenseCapacityException.findFirst({
        where: { id, tenant_id: tenantId, environment_id: environmentId },
      });
    if (!exception || exception.status !== 'OPEN') {
      throw new ConflictException(`Capacity exception '${id}' is not OPEN`);
    }
    if (
      exception.overflow_policy === 'CUSTOMER_AUTHORIZED_PAID_WORK' &&
      exception.paid_work_status !== 'APPROVED'
    ) {
      throw new ConflictException(
        'Paid overflow work must be approved before post-incident reconciliation',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.managedDefenseCapacityException.update({
        where: { id },
        data: {
          reconciliation_snapshot: JSON.stringify(dto.reconciliation),
          reconciled_by: reconciledBy,
          reconciled_at: new Date(),
          status: 'RECONCILED',
          closed_at: new Date(),
        },
      });
      await tx.managedDefenseDeliveryEvent.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          managed_defense_profile_id: exception.managed_defense_profile_id,
          event_type: 'POST_INCIDENT_RECONCILIATION',
          source_reference: exception.id,
          evidence_reference: dto.evidenceReference,
          actor_id: reconciledBy,
          occurred_at: new Date(),
          details: JSON.stringify(dto.reconciliation),
          immutable_hash: this.hash({
            exceptionId: exception.id,
            reconciliation: dto.reconciliation,
            evidenceReference: dto.evidenceReference,
          }),
        },
      });
      return updated;
    });
  }

  async recordCapabilityImpact(
    tenantId: string,
    environmentId: string,
    dto: RecordCapabilityImpactDto,
  ) {
    const profile = await this.requireProfile(
      dto.managedDefenseProfileId,
      tenantId,
      environmentId,
    );
    if (profile.status !== 'ACTIVE') {
      throw new ConflictException(
        'Capability impacts require an ACTIVE Managed Defense profile',
      );
    }
    const eligibleCapabilities = this.parseArray(
      profile.credit_eligible_capabilities,
    );
    const allowedSlas = this.parseArray(profile.sla_definition_ids);
    const technologyScope = this.parseObject(profile.technology_scope);
    const approvedConnectors = Array.isArray(technologyScope.connectors)
      ? technologyScope.connectors.filter(
          (connector): connector is string => typeof connector === 'string',
        )
      : [];
    const sla = dto.slaDefinitionId
      ? await this.prisma.slaDefinition.findUnique({
          where: { id: dto.slaDefinitionId },
        })
      : null;
    const supportedFailure =
      dto.failureType === 'SUPPORTED_CONNECTOR_FAILURE' &&
      !!dto.connectorReference &&
      approvedConnectors.includes(dto.connectorReference);
    const capabilityEligible = eligibleCapabilities.includes(dto.capabilityKey);
    const slaEligible =
      !!sla &&
      sla.status === 'APPROVED' &&
      allowedSlas.includes(sla.id) &&
      sla.service_tier === profile.service_tier;
    const claimEligibility =
      supportedFailure && capabilityEligible && slaEligible;
    const eligibilityReason = claimEligibility
      ? 'CONTRACT_CAPABILITY_AND_APPROVED_SLA_ELIGIBLE'
      : dto.failureType !== 'SUPPORTED_CONNECTOR_FAILURE'
        ? `EXCLUDED_FAILURE_TYPE_${dto.failureType}`
        : !dto.connectorReference ||
            !approvedConnectors.includes(dto.connectorReference)
          ? 'CONNECTOR_NOT_APPROVED_IN_CONTRACT_SCOPE'
          : !capabilityEligible
            ? 'CAPABILITY_NOT_CREDIT_ELIGIBLE_IN_CONTRACT'
            : 'NO_MATCHING_APPROVED_CONTRACT_SLA';
    return this.prisma.managedDefenseCapabilityImpact.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        managed_defense_profile_id: profile.id,
        capability_key: dto.capabilityKey,
        affected_scope: dto.affectedScope,
        connector_reference: dto.connectorReference,
        failure_type: dto.failureType,
        claim_eligibility: claimEligibility,
        eligibility_reason: eligibilityReason,
        sla_definition_id: claimEligibility ? sla!.id : undefined,
        evidence_refs: JSON.stringify(dto.evidenceRefs),
        recorded_by: dto.recordedBy,
        occurred_at: new Date(dto.occurredAt),
      },
    });
  }

  listCapabilityImpacts(tenantId: string, environmentId: string) {
    return this.prisma.managedDefenseCapabilityImpact.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: { occurred_at: 'desc' },
    });
  }

  async resolveCapabilityImpact(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const impact = await this.prisma.managedDefenseCapabilityImpact.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!impact) {
      throw new NotFoundException(`Capability impact '${id}' not found`);
    }
    if (impact.status !== 'OPEN') {
      throw new ConflictException(`Capability impact '${id}' is not OPEN`);
    }
    return this.prisma.managedDefenseCapabilityImpact.update({
      where: { id },
      data: { status: 'RESOLVED', resolved_at: new Date() },
    });
  }
}
