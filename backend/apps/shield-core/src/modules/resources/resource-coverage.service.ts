import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { assertTransition } from '../commerce/state-machine.util';

const COVERAGE_TRANSITIONS: Record<string, string[]> = {
  DISCOVERED: ['REVIEW_REQUIRED', 'EXCLUDED'],
  REVIEW_REQUIRED: ['COVERED', 'BILLABLE', 'EXCLUDED'],
  COVERED: ['BILLABLE', 'STALE', 'EXCLUDED'],
  BILLABLE: ['STALE', 'EXCLUDED'],
  STALE: ['REVIEW_REQUIRED', 'COVERED', 'REMOVED'],
  EXCLUDED: ['REVIEW_REQUIRED'],
  REMOVED: [],
};

export class CreateCoveragePolicyDto {
  @IsString()
  policyKey!: string;

  @IsUUID()
  resourceDefinitionId!: string;

  @IsUUID()
  meterDefinitionId!: string;

  @IsIn(['COVERED', 'BILLABLE'])
  coverageOutcome!: 'COVERED' | 'BILLABLE';

  @IsOptional()
  @IsInt()
  @IsPositive()
  committedQuantity?: number;

  @IsBoolean()
  autoEnroll!: boolean;

  @IsOptional()
  @IsInt()
  @IsPositive()
  thresholdQuantity?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  noticePeriodDays?: number;

  @IsOptional()
  @IsString()
  noticeTemplate?: string;

  @IsOptional()
  @IsArray()
  disclosedMetricFamilies?: string[];

  @IsOptional()
  @IsString()
  disclosureReference?: string;

  @IsISO8601()
  effectiveFrom!: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;

  @IsString()
  reason!: string;
}

export class DecideCoveragePolicyDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class AcceptResourceCoverageDto {
  @IsUUID()
  policyId!: string;

  @IsString()
  reason!: string;
}

export class ExcludeResourceDto {
  @IsString()
  reason!: string;
}

export class DeliverEnrollmentNoticeDto {
  @IsString()
  noticeReference!: string;

  @IsISO8601()
  deliveredAt!: Date;
}

export class CancelEnrollmentNoticeDto {
  @IsString()
  reason!: string;
}

export class ProcessAutoEnrollmentDto {
  @IsOptional()
  @IsISO8601()
  asOf?: Date;
}

type ObservationForCoverage = {
  id: string;
  tenant_id: string;
  environment_id: string;
  resource_definition_id: string | null;
  resource_family: string;
  metric_family: string;
  physical_resource_id: string;
  coverage_state: string;
};

/**
 * Category C1/C2 scope authority. It is deliberately separate from discovery:
 * only an approved policy plus an auditable decision may set BILLABLE.
 */
@Injectable()
export class ResourceCoverageService {
  private readonly logger = new Logger(ResourceCoverageService.name);

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

  async getPolicyForTenant(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const policy = await this.prisma.resourceCoveragePolicy.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
      include: { resourceDefinition: true, meterDefinition: true },
    });
    if (!policy) {
      throw new NotFoundException(`Resource coverage policy '${id}' not found`);
    }
    return policy;
  }

  async listPolicies(tenantId: string, environmentId: string) {
    return this.prisma.resourceCoveragePolicy.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      include: { resourceDefinition: true, meterDefinition: true },
      orderBy: [{ policy_key: 'asc' }, { version: 'desc' }],
    });
  }

  private assertPolicyConfiguration(dto: CreateCoveragePolicyDto) {
    const key = dto.policyKey?.trim();
    if (!key || !dto.reason?.trim()) {
      throw new BadRequestException('policyKey and reason must be non-empty');
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
    if (dto.autoEnroll) {
      if (
        !dto.thresholdQuantity ||
        !dto.capQuantity ||
        !dto.noticePeriodDays ||
        !dto.noticeTemplate?.trim()
      ) {
        throw new BadRequestException(
          'Auto-enrollment requires thresholdQuantity, capQuantity, noticePeriodDays and noticeTemplate',
        );
      }
      if (dto.thresholdQuantity > dto.capQuantity) {
        throw new BadRequestException(
          'Auto-enrollment thresholdQuantity cannot exceed capQuantity',
        );
      }
    } else if (
      dto.thresholdQuantity !== undefined ||
      dto.noticePeriodDays !== undefined ||
      dto.noticeTemplate !== undefined
    ) {
      throw new BadRequestException(
        'Threshold and notice settings are only valid when autoEnroll is true',
      );
    }
  }

  async createPolicy(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateCoveragePolicyDto,
  ) {
    this.assertPolicyConfiguration(dto);
    const definition = await this.prisma.protectedResourceDefinition.findUnique(
      {
        where: { id: dto.resourceDefinitionId },
      },
    );
    if (!definition || definition.status !== 'APPROVED') {
      throw new ConflictException(
        'Coverage policies require an APPROVED protected-resource definition',
      );
    }
    const meter = await this.prisma.meterDefinition.findUnique({
      where: { id: dto.meterDefinitionId },
    });
    if (!meter || meter.status !== 'APPROVED') {
      throw new ConflictException(
        'Coverage policies require an APPROVED meter definition',
      );
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : undefined;
    if (
      meter.effective_from > effectiveFrom ||
      (meter.effective_to && (!effectiveTo || meter.effective_to < effectiveTo))
    ) {
      throw new ConflictException(
        'The meter definition is not effective for the complete coverage-policy window',
      );
    }

    const ephemeral = this.parseObject(definition.ephemeral_policy);
    const aggregationMethod =
      typeof ephemeral.aggregationMethod === 'string'
        ? ephemeral.aggregationMethod
        : 'HIGH_WATER';
    const observationWindow =
      typeof ephemeral.observationWindow === 'string'
        ? ephemeral.observationWindow
        : meter.aggregation_window;
    const minimumDurationSeconds =
      typeof ephemeral.minimumDurationSeconds === 'number' &&
      Number.isInteger(ephemeral.minimumDurationSeconds) &&
      ephemeral.minimumDurationSeconds >= 0
        ? ephemeral.minimumDurationSeconds
        : 0;
    if (aggregationMethod === 'COMMITTED' && !dto.committedQuantity) {
      throw new BadRequestException(
        'committedQuantity is required by the resource definition COMMITTED aggregation policy',
      );
    }

    const allowedOverlap = this.parseObject(definition.overlap_policy);
    const allowedMetrics = Array.isArray(allowedOverlap.disclosedMetricFamilies)
      ? allowedOverlap.disclosedMetricFamilies.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    const disclosed = [
      ...new Set(
        (dto.disclosedMetricFamilies ?? []).map((item) => item.trim()),
      ),
    ].filter(Boolean);
    const unapprovedDisclosures = disclosed.filter(
      (metric) => !allowedMetrics.includes(metric),
    );
    if (unapprovedDisclosures.length > 0) {
      throw new BadRequestException(
        `Metric overlap is not allowed by the protected-resource definition: ${unapprovedDisclosures.join(', ')}`,
      );
    }
    if (disclosed.length > 0 && !dto.disclosureReference?.trim()) {
      throw new BadRequestException(
        'disclosureReference is required when overlapping metrics are disclosed',
      );
    }

    const latest = await this.prisma.resourceCoveragePolicy.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        policy_key: dto.policyKey.trim(),
      },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.resourceCoveragePolicy.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          policy_key: dto.policyKey.trim(),
          version,
          resource_definition_id: definition.id,
          resource_family: definition.resource_family,
          metric_family: definition.metric_family,
          meter_definition_id: meter.id,
          coverage_outcome: dto.coverageOutcome,
          aggregation_method: aggregationMethod,
          observation_window: observationWindow,
          minimum_duration_seconds: minimumDurationSeconds,
          committed_quantity: dto.committedQuantity,
          auto_enroll: dto.autoEnroll,
          threshold_quantity: dto.thresholdQuantity,
          cap_quantity: dto.capQuantity,
          notice_period_days: dto.noticePeriodDays,
          notice_template: dto.noticeTemplate?.trim(),
          disclosed_metric_families: JSON.stringify(disclosed),
          disclosure_reference: dto.disclosureReference?.trim(),
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          status: 'PENDING_APPROVAL',
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'RESOURCE_COVERAGE_POLICY',
          objectType: 'ResourceCoveragePolicy',
          objectId: policy.id,
          tenantId,
          requestedBy,
          reason: dto.reason.trim(),
          proposedSnapshot: {
            policyKey: policy.policy_key,
            version,
            environmentId,
            resourceDefinitionId: definition.id,
            resourceFamily: definition.resource_family,
            metricFamily: definition.metric_family,
            meterDefinitionId: meter.id,
            meterVersion: meter.version,
            coverageOutcome: dto.coverageOutcome,
            aggregationMethod,
            observationWindow,
            minimumDurationSeconds,
            committedQuantity: dto.committedQuantity,
            autoEnroll: dto.autoEnroll,
            thresholdQuantity: dto.thresholdQuantity,
            capQuantity: dto.capQuantity,
            noticePeriodDays: dto.noticePeriodDays,
            disclosedMetricFamilies: disclosed,
            disclosureReference: dto.disclosureReference,
            effectiveFrom,
            effectiveTo,
          },
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
          expiresAt: effectiveTo,
        },
        tx,
      );
      return tx.resourceCoveragePolicy.update({
        where: { id: policy.id },
        data: { approval_id: approval.id },
        include: { resourceDefinition: true, meterDefinition: true },
      });
    });
  }

  async decidePolicy(
    id: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    dto: DecideCoveragePolicyDto,
  ) {
    const policy = await this.getPolicyForTenant(id, tenantId, environmentId);
    if (policy.status !== 'PENDING_APPROVAL' || !policy.approval_id) {
      throw new ConflictException(
        `Coverage policy '${id}' has no pending linked approval`,
      );
    }
    if (dto.decision === 'APPROVED') {
      if (
        policy.resourceDefinition.status !== 'APPROVED' ||
        policy.meterDefinition.status !== 'APPROVED'
      ) {
        throw new ConflictException(
          'The linked resource and meter definitions must still be APPROVED',
        );
      }
    }

    await this.approvals.decideApproval(
      policy.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.resourceCoveragePolicy.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'APPROVED',
                approved_by: approverId,
                approved_at: new Date(),
              }
            : { status: 'REJECTED' },
        include: { resourceDefinition: true, meterDefinition: true },
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

  private async getObservation(
    tenantId: string,
    environmentId: string,
    observationId: string,
  ) {
    const observation = await this.prisma.resourceObservation.findFirst({
      where: {
        id: observationId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
    });
    if (!observation) {
      throw new NotFoundException(
        `Resource observation '${observationId}' not found`,
      );
    }
    return observation;
  }

  private async getEffectiveApprovedPolicy(
    id: string,
    tenantId: string,
    environmentId: string,
    at = new Date(),
  ) {
    const policy = await this.getPolicyForTenant(id, tenantId, environmentId);
    if (
      policy.status !== 'APPROVED' ||
      policy.effective_from > at ||
      (policy.effective_to && policy.effective_to < at) ||
      policy.resourceDefinition.status !== 'APPROVED' ||
      policy.meterDefinition.status !== 'APPROVED' ||
      policy.meterDefinition.effective_from > at ||
      (policy.meterDefinition.effective_to &&
        policy.meterDefinition.effective_to < at)
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: 'COVERAGE_POLICY_NOT_EFFECTIVE',
        message:
          'Coverage requires an approved, effective policy and approved, effective resource/meter definitions',
      });
    }
    return policy;
  }

  private async assertCap(policy: { id: string; cap_quantity: number | null }) {
    if (!policy.cap_quantity) return;
    const current = await this.prisma.resourceObservation.count({
      where: {
        coverage_policy_id: policy.id,
        coverage_state: { in: ['COVERED', 'BILLABLE'] },
      },
    });
    if (current >= policy.cap_quantity) {
      throw new ConflictException({
        statusCode: 409,
        error: 'COVERAGE_POLICY_CAP_REACHED',
        message: `Coverage policy cap of ${policy.cap_quantity} resources has been reached`,
      });
    }
  }

  private async assertAutoThreshold(policy: {
    resource_definition_id: string;
    threshold_quantity: number | null;
    tenant_id: string;
    environment_id: string;
  }) {
    if (!policy.threshold_quantity) {
      throw new ConflictException(
        'Auto-enrollment policy has no authorized threshold',
      );
    }
    const candidates = await this.prisma.resourceObservation.count({
      where: {
        tenant_id: policy.tenant_id,
        environment_id: policy.environment_id,
        resource_definition_id: policy.resource_definition_id,
        coverage_state: {
          in: ['REVIEW_REQUIRED', 'COVERED', 'BILLABLE'],
        },
      },
    });
    if (candidates > policy.threshold_quantity) {
      throw new ConflictException({
        statusCode: 409,
        error: 'AUTO_ENROLLMENT_THRESHOLD_EXCEEDED',
        message: `Candidate count ${candidates} exceeds authorized threshold ${policy.threshold_quantity}`,
      });
    }
  }

  private async assertOverlapAuthorized(
    observation: ObservationForCoverage,
    policy: {
      id: string;
      metric_family: string;
      coverage_outcome: string;
      disclosed_metric_families: string;
      disclosure_reference: string | null;
    },
  ) {
    if (policy.coverage_outcome !== 'BILLABLE') return;
    const overlaps = await this.prisma.resourceObservation.findMany({
      where: {
        tenant_id: observation.tenant_id,
        environment_id: observation.environment_id,
        physical_resource_id: observation.physical_resource_id,
        id: { not: observation.id },
        metric_family: { not: observation.metric_family },
        coverage_state: 'BILLABLE',
      },
      include: { coveragePolicy: true },
    });
    const currentDisclosures = this.parseStringArray(
      policy.disclosed_metric_families,
    );
    for (const overlap of overlaps) {
      const reciprocal = overlap.coveragePolicy
        ? this.parseStringArray(
            overlap.coveragePolicy.disclosed_metric_families,
          )
        : [];
      if (
        !policy.disclosure_reference ||
        !overlap.coveragePolicy?.disclosure_reference ||
        !currentDisclosures.includes(overlap.metric_family) ||
        !reciprocal.includes(policy.metric_family)
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'UNDISCLOSED_RESOURCE_METRIC_OVERLAP',
          message: `Physical resource overlap between '${policy.metric_family}' and '${overlap.metric_family}' is not reciprocally disclosed`,
        });
      }
    }
  }

  private async applyDecision(
    observation: ObservationForCoverage,
    targetState: string,
    actorId: string,
    reason: string,
    decisionType: string,
    policyId?: string,
  ) {
    assertTransition(
      COVERAGE_TRANSITIONS,
      observation.coverage_state,
      targetState,
      'protected resource coverage',
    );
    const decidedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.resourceObservation.update({
        where: { id: observation.id },
        data: {
          coverage_state: targetState,
          billable_state:
            targetState === 'BILLABLE' ? 'BILLABLE' : 'NON_BILLABLE',
          coverage_policy_id: policyId,
          decision_by: actorId,
          decision_reason: reason,
          decided_at: decidedAt,
          exclusion_reason: targetState === 'EXCLUDED' ? reason : null,
          auto_enrollment_status:
            decisionType === 'AUTO_ENROLLMENT' ? 'APPLIED' : 'MANUAL',
        },
      });
      await tx.resourceCoverageDecision.create({
        data: {
          tenant_id: observation.tenant_id,
          observation_id: observation.id,
          coverage_policy_id: policyId,
          from_state: observation.coverage_state,
          to_state: targetState,
          decision_type: decisionType,
          reason,
          actor_id: actorId,
          decided_at: decidedAt,
        },
      });
      return updated;
    });
  }

  /** Move a new discovery into review and, if authorized, prepare notice. */
  async routeDiscoveredObservation(observation: ObservationForCoverage) {
    if (observation.coverage_state !== 'DISCOVERED') {
      return { observation, notice: null };
    }
    const review = await this.applyDecision(
      observation,
      'REVIEW_REQUIRED',
      'system:resource-discovery',
      'New discovery requires an authorized coverage decision',
      'SYSTEM_ROUTING',
    );
    const now = new Date();
    const policies = await this.prisma.resourceCoveragePolicy.findMany({
      where: {
        tenant_id: observation.tenant_id,
        environment_id: observation.environment_id,
        resource_definition_id: observation.resource_definition_id ?? '',
        metric_family: observation.metric_family,
        status: 'APPROVED',
        auto_enroll: true,
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
    });
    if (policies.length !== 1) {
      const status = policies.length > 1 ? 'POLICY_CONFLICT' : 'NOT_ELIGIBLE';
      const updated = await this.prisma.resourceObservation.update({
        where: { id: observation.id },
        data: { auto_enrollment_status: status },
      });
      return { observation: updated, notice: null };
    }

    const policy = policies[0];
    const candidateCount = await this.prisma.resourceObservation.count({
      where: {
        tenant_id: observation.tenant_id,
        environment_id: observation.environment_id,
        resource_definition_id: policy.resource_definition_id,
        coverage_state: {
          in: ['REVIEW_REQUIRED', 'COVERED', 'BILLABLE'],
        },
      },
    });
    if (
      !policy.threshold_quantity ||
      candidateCount > policy.threshold_quantity
    ) {
      const updated = await this.prisma.resourceObservation.update({
        where: { id: observation.id },
        data: { auto_enrollment_status: 'THRESHOLD_REVIEW' },
      });
      return { observation: updated, notice: null };
    }
    const billableCount = await this.prisma.resourceObservation.count({
      where: { coverage_policy_id: policy.id, coverage_state: 'BILLABLE' },
    });
    if (policy.cap_quantity && billableCount >= policy.cap_quantity) {
      const updated = await this.prisma.resourceObservation.update({
        where: { id: observation.id },
        data: { auto_enrollment_status: 'CAP_REVIEW' },
      });
      return { observation: updated, notice: null };
    }

    const notice = await this.prisma.resourceEnrollmentNotice.create({
      data: {
        tenant_id: observation.tenant_id,
        observation_id: observation.id,
        coverage_policy_id: policy.id,
        status: 'PENDING_DELIVERY',
      },
    });
    const updated = await this.prisma.resourceObservation.update({
      where: { id: observation.id },
      data: { auto_enrollment_status: 'NOTICE_PENDING' },
    });
    return { observation: updated, notice };
  }

  async acceptResource(
    tenantId: string,
    environmentId: string,
    observationId: string,
    actorId: string,
    dto: AcceptResourceCoverageDto,
  ) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException(
        'A non-empty acceptance reason is required',
      );
    }
    const observation = await this.getObservation(
      tenantId,
      environmentId,
      observationId,
    );
    const policy = await this.getEffectiveApprovedPolicy(
      dto.policyId,
      tenantId,
      environmentId,
    );
    if (
      observation.resource_definition_id !== policy.resource_definition_id ||
      observation.resource_family !== policy.resource_family ||
      observation.metric_family !== policy.metric_family
    ) {
      throw new ConflictException(
        'Coverage policy does not match the observation resource definition and metric family',
      );
    }
    if (policy.coverage_outcome === 'BILLABLE') {
      await this.assertCap(policy);
      await this.assertOverlapAuthorized(observation, policy);
    }
    await this.prisma.resourceEnrollmentNotice.updateMany({
      where: {
        observation_id: observation.id,
        status: { in: ['PENDING_DELIVERY', 'DELIVERED'] },
      },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancellation_reason: 'Superseded by manual coverage acceptance',
      },
    });
    return this.applyDecision(
      observation,
      policy.coverage_outcome,
      actorId,
      dto.reason.trim(),
      'MANUAL_ACCEPTANCE',
      policy.id,
    );
  }

  async excludeResource(
    tenantId: string,
    environmentId: string,
    observationId: string,
    actorId: string,
    dto: ExcludeResourceDto,
  ) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A non-empty exclusion reason is required');
    }
    const observation = await this.getObservation(
      tenantId,
      environmentId,
      observationId,
    );
    await this.prisma.resourceEnrollmentNotice.updateMany({
      where: {
        observation_id: observation.id,
        status: { in: ['PENDING_DELIVERY', 'DELIVERED'] },
      },
      data: {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancellation_reason: dto.reason.trim(),
      },
    });
    return this.applyDecision(
      observation,
      'EXCLUDED',
      actorId,
      dto.reason.trim(),
      'MANUAL_EXCLUSION',
    );
  }

  async getDecisionHistory(
    tenantId: string,
    environmentId: string,
    observationId: string,
  ) {
    await this.getObservation(tenantId, environmentId, observationId);
    return this.prisma.resourceCoverageDecision.findMany({
      where: { tenant_id: tenantId, observation_id: observationId },
      orderBy: { decided_at: 'asc' },
    });
  }

  async listNotices(tenantId: string, environmentId: string) {
    return this.prisma.resourceEnrollmentNotice.findMany({
      where: {
        tenant_id: tenantId,
        observation: { environment_id: environmentId },
      },
      include: { observation: true, coveragePolicy: true },
      orderBy: { created_at: 'desc' },
    });
  }

  /** Workload outbox view used by the notification delivery worker. */
  async listPendingNoticeDeliveries(tenantId: string) {
    return this.prisma.resourceEnrollmentNotice.findMany({
      where: { tenant_id: tenantId, status: 'PENDING_DELIVERY' },
      include: { observation: true, coveragePolicy: true },
      orderBy: { scheduled_at: 'asc' },
    });
  }

  async markNoticeDelivered(
    tenantId: string,
    noticeId: string,
    dto: DeliverEnrollmentNoticeDto,
  ) {
    const notice = await this.prisma.resourceEnrollmentNotice.findFirst({
      where: { id: noticeId, tenant_id: tenantId },
      include: { coveragePolicy: true, observation: true },
    });
    if (!notice) {
      throw new NotFoundException(`Enrollment notice '${noticeId}' not found`);
    }
    if (notice.status !== 'PENDING_DELIVERY') {
      throw new ConflictException(
        `Enrollment notice '${noticeId}' is ${notice.status}, not PENDING_DELIVERY`,
      );
    }
    if (!dto.noticeReference?.trim()) {
      throw new BadRequestException('noticeReference must be non-empty');
    }
    const deliveredAt = new Date(dto.deliveredAt);
    const days = notice.coveragePolicy.notice_period_days;
    if (!days || days < 1) {
      throw new ConflictException(
        'Auto-enrollment policy has no valid notice period',
      );
    }
    const effectiveAt = new Date(
      deliveredAt.getTime() + days * 24 * 60 * 60 * 1000,
    );
    const updated = await this.prisma.resourceEnrollmentNotice.update({
      where: { id: notice.id },
      data: {
        status: 'DELIVERED',
        notice_reference: dto.noticeReference.trim(),
        delivered_at: deliveredAt,
        effective_at: effectiveAt,
      },
    });
    await this.prisma.resourceObservation.update({
      where: { id: notice.observation_id },
      data: { auto_enrollment_status: 'NOTICE_DELIVERED' },
    });
    return updated;
  }

  async cancelNotice(
    tenantId: string,
    environmentId: string,
    noticeId: string,
    actorId: string,
    dto: CancelEnrollmentNoticeDto,
  ) {
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A cancellation reason is required');
    }
    const notice = await this.prisma.resourceEnrollmentNotice.findFirst({
      where: {
        id: noticeId,
        tenant_id: tenantId,
        observation: { environment_id: environmentId },
      },
      include: { observation: true },
    });
    if (!notice) {
      throw new NotFoundException(`Enrollment notice '${noticeId}' not found`);
    }
    if (!['PENDING_DELIVERY', 'DELIVERED'].includes(notice.status)) {
      throw new ConflictException(
        `Enrollment notice '${noticeId}' cannot be cancelled from ${notice.status}`,
      );
    }
    const now = new Date();
    const updated = await this.prisma.resourceEnrollmentNotice.update({
      where: { id: notice.id },
      data: {
        status: 'CANCELLED',
        cancelled_at: now,
        cancellation_reason: `${dto.reason.trim()} (by ${actorId})`,
      },
    });
    await this.prisma.resourceObservation.update({
      where: { id: notice.observation_id },
      data: { auto_enrollment_status: 'CANCELLED_REVIEW' },
    });
    return updated;
  }

  async processAutoEnrollments(asOf = new Date(), tenantId?: string) {
    const notices = await this.prisma.resourceEnrollmentNotice.findMany({
      where: {
        tenant_id: tenantId,
        status: 'DELIVERED',
        effective_at: { lte: asOf },
      },
      include: { observation: true, coveragePolicy: true },
      orderBy: { effective_at: 'asc' },
    });
    const results: Array<{
      noticeId: string;
      status: string;
      reason?: string;
    }> = [];
    for (const notice of notices) {
      try {
        const policy = await this.getEffectiveApprovedPolicy(
          notice.coverage_policy_id,
          notice.tenant_id,
          notice.observation.environment_id,
          asOf,
        );
        if (!policy.auto_enroll) {
          throw new ConflictException(
            'Policy no longer permits auto-enrollment',
          );
        }
        await this.assertAutoThreshold(policy);
        await this.assertCap(policy);
        await this.assertOverlapAuthorized(notice.observation, policy);
        await this.applyDecision(
          notice.observation,
          policy.coverage_outcome,
          'system:auto-enrollment',
          `Applied after delivered notice '${notice.notice_reference}' and policy notice period`,
          'AUTO_ENROLLMENT',
          policy.id,
        );
        await this.prisma.resourceEnrollmentNotice.update({
          where: { id: notice.id },
          data: { status: 'APPLIED', applied_at: asOf },
        });
        results.push({ noticeId: notice.id, status: 'APPLIED' });
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Auto-enrollment blocked';
        await this.prisma.resourceEnrollmentNotice.update({
          where: { id: notice.id },
          data: {
            status: 'BLOCKED_REVIEW',
            cancellation_reason: reason,
          },
        });
        await this.prisma.resourceObservation.update({
          where: { id: notice.observation_id },
          data: { auto_enrollment_status: 'BLOCKED_REVIEW' },
        });
        results.push({ noticeId: notice.id, status: 'BLOCKED_REVIEW', reason });
      }
    }
    return results;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processDueAutoEnrollments() {
    const results = await this.processAutoEnrollments();
    if (results.length > 0) {
      this.logger.log(
        `Processed ${results.length} resource auto-enrollment(s)`,
      );
    }
  }
}
