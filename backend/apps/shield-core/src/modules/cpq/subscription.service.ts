import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';
import { assertTransition } from '../commerce/state-machine.util';

const OFFER_TYPES = [
  'MANAGED_DEFENSE',
  'CONTINUOUS_ASSURANCE',
  'EXPOSURE_MANAGEMENT',
  'AI_SECURITY',
] as const;

const SUBSCRIPTION_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['CANCELLED', 'EXPIRED'],
  CANCELLED: [],
  EXPIRED: [],
};

const AMENDMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['PENDING_ACTIVATION', 'REMEDIATION_REQUIRED', 'SCHEDULED'],
  PENDING_ACTIVATION: ['APPLIED'],
  REMEDIATION_REQUIRED: ['REMEDIATION_REQUIRED', 'SCHEDULED'],
  SCHEDULED: ['REMEDIATION_REQUIRED', 'APPLIED'],
  REJECTED: [],
  APPLIED: [],
  MIGRATION_REVIEW: [],
};

export class CreateSubscriptionDto {
  orderId!: string;
  commercialAccountId!: string;
  contractId!: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
}

export class RequestUpgradeDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(OFFER_TYPES, { each: true })
  offerTypes!: string[];

  @IsObject()
  commercialPreview!: Record<string, unknown>;

  @IsString()
  commercialReason!: string;

  @IsOptional()
  @IsISO8601()
  effectiveAt?: Date;
}

export class RequestDowngradeDto {
  @IsOptional()
  @IsArray()
  @IsIn(OFFER_TYPES, { each: true })
  offerTypesToRemove?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  connectorIdsToDisable?: string[];

  @IsOptional()
  @IsString()
  targetRetentionProfile?: string;

  @IsObject()
  commercialPreview!: Record<string, unknown>;

  @IsString()
  commercialReason!: string;

  /** An explicit agreed date; otherwise the subscription renewal/end is used. */
  @IsOptional()
  @IsISO8601()
  effectiveAt?: Date;
}

export class VerifyUpgradeReadinessDto {
  @IsBoolean()
  claimEligibility!: boolean;

  @IsBoolean()
  deploymentReady!: boolean;

  @IsBoolean()
  serviceCapacityReady!: boolean;

  @IsString()
  deploymentEvidenceRef!: string;

  @IsString()
  capacityEvidenceRef!: string;

  @IsString()
  claimEvidenceRef!: string;
}

export class RecordDowngradeRemediationDto {
  @IsBoolean()
  preserveHistoricalEvidence!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  actions!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  evidenceRefs!: string[];
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: CommercialApprovalService,
  ) {}

  async createSubscription(
    dto: CreateSubscriptionDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.commercialSubscription.create({
      data: {
        order_id: dto.orderId,
        commercial_account_id: dto.commercialAccountId,
        contract_id: dto.contractId,
        status: 'PENDING',
        effective_from: dto.effectiveFrom,
        effective_to: dto.effectiveTo,
      },
    });
  }

  async getSubscriptionById(subscriptionId: string) {
    const subscription = await this.prisma.commercialSubscription.findUnique({
      where: { id: subscriptionId },
      include: { amendments: true },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription '${subscriptionId}' not found`);
    }
    return subscription;
  }

  private async requireActiveBinding(
    commercialAccountId: string,
    tenantId: string,
    environmentId: string,
  ) {
    const now = new Date();
    const binding = await this.prisma.commercialAccountTenantBinding.findFirst({
      where: {
        commercial_account_id: commercialAccountId,
        tenant_id: tenantId,
        environment_id: environmentId,
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
    });
    if (!binding) {
      throw new NotFoundException(
        `Subscription is not available in tenant '${tenantId}' and environment '${environmentId}'`,
      );
    }
    return binding;
  }

  async getSubscriptionForTenant(
    subscriptionId: string,
    tenantId: string,
    environmentId: string,
  ) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    await this.requireActiveBinding(
      subscription.commercial_account_id,
      tenantId,
      environmentId,
    );
    return subscription;
  }

  async activateSubscription(subscriptionId: string) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    assertTransition(
      SUBSCRIPTION_TRANSITIONS,
      subscription.status,
      'ACTIVE',
      'subscription',
    );
    return this.prisma.commercialSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' },
    });
  }

  async cancelSubscription(subscriptionId: string) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    assertTransition(
      SUBSCRIPTION_TRANSITIONS,
      subscription.status,
      'CANCELLED',
      'subscription',
    );
    return this.prisma.commercialSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'CANCELLED' },
    });
  }

  private validateFutureOrNow(value: Date, field: string) {
    if (value.getTime() < Date.now() - 60_000) {
      throw new BadRequestException(`${field} cannot be in the past`);
    }
  }

  private async createChange(
    subscription: Awaited<
      ReturnType<SubscriptionService['getSubscriptionById']>
    >,
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    amendmentType: 'UPGRADE' | 'DOWNGRADE',
    effectiveAt: Date,
    commercialReason: string,
    beforeSnapshot: Record<string, unknown>,
    proposedSnapshot: Record<string, unknown>,
  ) {
    if (subscription.status !== 'ACTIVE') {
      throw new ConflictException(
        `Subscription '${subscription.id}' is ${subscription.status}; only ACTIVE subscriptions can change`,
      );
    }
    await this.requireActiveBinding(
      subscription.commercial_account_id,
      tenantId,
      environmentId,
    );

    return this.prisma.$transaction(async (tx) => {
      const amendment = await tx.commercialAmendment.create({
        data: {
          subscription_id: subscription.id,
          amendment_type: amendmentType,
          status: 'PENDING_APPROVAL',
          tenant_id: tenantId,
          environment_id: environmentId,
          effective_at: effectiveAt,
          before_snapshot: JSON.stringify(beforeSnapshot),
          proposed_snapshot: JSON.stringify(proposedSnapshot),
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvalService.requestApproval(
        {
          changeType: 'CONTRACT_OVERRIDE',
          objectType: 'CommercialAmendment',
          objectId: amendment.id,
          tenantId,
          requestedBy,
          reason: commercialReason,
          beforeSnapshot,
          proposedSnapshot,
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
        },
        tx,
      );
      return tx.commercialAmendment.update({
        where: { id: amendment.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async requestUpgrade(
    subscriptionId: string,
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: RequestUpgradeDto,
  ) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    this.validateCommercialRequest(dto.commercialReason, dto.commercialPreview);
    const effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : new Date();
    this.validateFutureOrNow(effectiveAt, 'effectiveAt');
    const offerTypes = [...new Set(dto.offerTypes)];
    return this.createChange(
      subscription,
      tenantId,
      environmentId,
      requestedBy,
      'UPGRADE',
      effectiveAt,
      dto.commercialReason,
      { subscriptionStatus: subscription.status },
      {
        offerTypes,
        commercialPreview: dto.commercialPreview,
        activationMode: 'PENDING_PREREQUISITES',
      },
    );
  }

  async requestDowngrade(
    subscriptionId: string,
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: RequestDowngradeDto,
  ) {
    const subscription = await this.getSubscriptionById(subscriptionId);
    this.validateCommercialRequest(dto.commercialReason, dto.commercialPreview);
    const offerTypesToRemove = [...new Set(dto.offerTypesToRemove ?? [])];
    const connectorIdsToDisable = [...new Set(dto.connectorIdsToDisable ?? [])];
    if (
      !offerTypesToRemove.length &&
      !connectorIdsToDisable.length &&
      !dto.targetRetentionProfile
    ) {
      throw new BadRequestException(
        'Downgrade must remove an offer, disable a connector, or change future retention',
      );
    }
    if (dto.targetRetentionProfile) {
      const allowedRetentionProfiles = new Set(
        (
          process.env.RETENTION_POLICY_REFS ??
          'default,standard-365d,security-365d,legal-7y'
        )
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
      if (!allowedRetentionProfiles.has(dto.targetRetentionProfile)) {
        throw new BadRequestException(
          `Unknown target retention profile '${dto.targetRetentionProfile}'`,
        );
      }
    }
    const effectiveAt = dto.effectiveAt
      ? new Date(dto.effectiveAt)
      : subscription.effective_to;
    if (!effectiveAt) {
      throw new BadRequestException(
        'Downgrade requires an agreed effectiveAt when the subscription has no renewal/end date',
      );
    }
    this.validateFutureOrNow(effectiveAt, 'effectiveAt');
    return this.createChange(
      subscription,
      tenantId,
      environmentId,
      requestedBy,
      'DOWNGRADE',
      effectiveAt,
      dto.commercialReason,
      { subscriptionStatus: subscription.status },
      {
        offerTypesToRemove,
        connectorIdsToDisable,
        targetRetentionProfile: dto.targetRetentionProfile,
        commercialPreview: dto.commercialPreview,
        historyTreatment: 'PRESERVE',
      },
    );
  }

  async getAmendmentById(amendmentId: string) {
    const amendment = await this.prisma.commercialAmendment.findUnique({
      where: { id: amendmentId },
      include: {
        subscription: true,
        activatedEntitlements: true,
        retentionTransition: true,
      },
    });
    if (!amendment) {
      throw new NotFoundException(`Amendment '${amendmentId}' not found`);
    }
    return amendment;
  }

  async getAmendmentForTenant(
    amendmentId: string,
    tenantId: string,
    environmentId: string,
  ) {
    const amendment = await this.getAmendmentById(amendmentId);
    if (
      amendment.tenant_id !== tenantId ||
      amendment.environment_id !== environmentId
    ) {
      throw new NotFoundException(`Amendment '${amendmentId}' not found`);
    }
    await this.requireActiveBinding(
      amendment.subscription.commercial_account_id,
      tenantId,
      environmentId,
    );
    return amendment;
  }

  async decideAmendment(
    amendmentId: string,
    tenantId: string,
    environmentId: string,
    approverId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
  ) {
    const amendment = await this.getAmendmentForTenant(
      amendmentId,
      tenantId,
      environmentId,
    );
    assertTransition(
      AMENDMENT_TRANSITIONS,
      amendment.status,
      decision,
      'subscription amendment',
    );
    if (!amendment.approval_id) {
      throw new ConflictException(
        'Amendment has no linked commercial approval',
      );
    }
    await this.approvalService.decideApproval(
      amendment.approval_id,
      approverId,
      decision,
      reason,
    );
    await this.prisma.commercialAmendment.update({
      where: { id: amendmentId },
      data: { status: decision, approved_by: approverId },
    });
    if (decision === 'APPROVED' && amendment.amendment_type === 'DOWNGRADE') {
      return this.assessDowngrade(amendmentId);
    }
    return this.getAmendmentById(amendmentId);
  }

  async verifyUpgradeReadiness(
    amendmentId: string,
    verifiedBy: string,
    dto: VerifyUpgradeReadinessDto,
  ) {
    const amendment = await this.getAmendmentById(amendmentId);
    if (amendment.amendment_type !== 'UPGRADE') {
      throw new BadRequestException(
        'Readiness verification only applies to upgrades',
      );
    }
    if (!['APPROVED', 'PENDING_ACTIVATION'].includes(amendment.status)) {
      throw new ConflictException(
        `Upgrade readiness cannot be recorded while status is ${amendment.status}`,
      );
    }
    for (const [ready, reference, field] of [
      [dto.claimEligibility, dto.claimEvidenceRef, 'claimEvidenceRef'],
      [dto.deploymentReady, dto.deploymentEvidenceRef, 'deploymentEvidenceRef'],
      [
        dto.serviceCapacityReady,
        dto.capacityEvidenceRef,
        'capacityEvidenceRef',
      ],
    ] as const) {
      if (ready && !reference.trim()) {
        throw new BadRequestException(
          `${field} is required when its gate passes`,
        );
      }
    }
    const allReady =
      dto.claimEligibility && dto.deploymentReady && dto.serviceCapacityReady;
    return this.prisma.commercialAmendment.update({
      where: { id: amendmentId },
      data: {
        status: allReady ? 'PENDING_ACTIVATION' : 'APPROVED',
        claim_eligibility: dto.claimEligibility,
        deployment_ready: dto.deploymentReady,
        service_capacity_ready: dto.serviceCapacityReady,
        readiness_snapshot: JSON.stringify({
          claimEvidenceRef: dto.claimEvidenceRef,
          deploymentEvidenceRef: dto.deploymentEvidenceRef,
          capacityEvidenceRef: dto.capacityEvidenceRef,
        }),
        readiness_verified_by: verifiedBy,
        readiness_verified_at: new Date(),
      },
    });
  }

  private parseProposed(amendment: { proposed_snapshot: string }) {
    return JSON.parse(amendment.proposed_snapshot) as Record<string, unknown>;
  }

  private validateCommercialRequest(
    commercialReason: string,
    commercialPreview: Record<string, unknown>,
  ) {
    if (!commercialReason.trim()) {
      throw new BadRequestException('commercialReason must not be empty');
    }
    if (!commercialPreview || Object.keys(commercialPreview).length === 0) {
      throw new BadRequestException(
        'A non-empty commercialPreview is required for approval',
      );
    }
  }

  async assessDowngrade(amendmentId: string) {
    const amendment = await this.getAmendmentById(amendmentId);
    if (amendment.amendment_type !== 'DOWNGRADE') {
      throw new BadRequestException(
        'Safety assessment only applies to downgrades',
      );
    }
    if (
      !['APPROVED', 'REMEDIATION_REQUIRED', 'SCHEDULED'].includes(
        amendment.status,
      )
    ) {
      throw new ConflictException(
        `Downgrade cannot be assessed while status is ${amendment.status}`,
      );
    }
    const proposed = this.parseProposed(amendment);
    const offerTypes = (proposed.offerTypesToRemove ?? []) as string[];
    const connectorIds = (proposed.connectorIdsToDisable ?? []) as string[];
    const targetRetentionProfile = proposed.targetRetentionProfile as
      string | undefined;
    const [
      activeCases,
      incidentWorkOrders,
      activeLegalHolds,
      evidenceCount,
      retentionProfiles,
      activeAuditPackages,
      connectors,
      entitlements,
    ] = await Promise.all([
      this.prisma.case.findMany({
        where: {
          tenant_id: amendment.tenant_id!,
          environment_id: amendment.environment_id!,
          status: { not: 'CLOSED' },
        },
        select: { id: true, status: true },
        take: 100,
      }),
      this.prisma.incidentWorkOrder.findMany({
        where: {
          contract_id: amendment.subscription.contract_id,
          status: 'ACTIVE',
        },
        select: { id: true, incident_reference: true },
        take: 100,
      }),
      this.prisma.legalHold.findMany({
        where: {
          tenant_id: amendment.tenant_id!,
          status: 'ACTIVE',
          OR: [{ ends_at: null }, { ends_at: { gte: new Date() } }],
        },
        select: { id: true },
        take: 100,
      }),
      this.prisma.evidenceRecord.count({
        where: {
          tenant_id: amendment.tenant_id!,
          environment_id: amendment.environment_id!,
          ...(targetRetentionProfile
            ? { retention_profile: { not: targetRetentionProfile } }
            : {}),
        },
      }),
      this.prisma.evidenceRecord.findMany({
        where: {
          tenant_id: amendment.tenant_id!,
          environment_id: amendment.environment_id!,
        },
        select: { retention_profile: true },
        distinct: ['retention_profile'],
      }),
      this.prisma.auditPackage.findMany({
        where: {
          tenant_id: amendment.tenant_id!,
          status: { notIn: ['SUPERSEDED', 'FAILED'] },
          retention_until: { gte: new Date() },
        },
        select: {
          id: true,
          status: true,
          audit_cycle_reference: true,
          retention_until: true,
        },
        take: 100,
      }),
      connectorIds.length
        ? this.prisma.connectorInstance.findMany({
            where: {
              id: { in: connectorIds },
              tenant_id: amendment.tenant_id!,
              environment_id: amendment.environment_id!,
              deletedAt: null,
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      offerTypes.length
        ? this.prisma.entitlement.findMany({
            where: {
              tenant_id: amendment.tenant_id!,
              offer_type: { in: offerTypes },
              status: 'ACTIVE',
            },
            select: { offer_type: true },
          })
        : Promise.resolve([]),
    ]);

    const foundConnectors = new Set(connectors.map((item) => item.id));
    const missingConnectors = connectorIds.filter(
      (id) => !foundConnectors.has(id),
    );
    const foundOffers = new Set(entitlements.map((item) => item.offer_type));
    const missingOffers = offerTypes.filter((offer) => !foundOffers.has(offer));
    const remediation = JSON.parse(
      amendment.remediation_plan || '{}',
    ) as Record<string, unknown>;
    const reasons: string[] = [];
    if (activeCases.length) reasons.push('ACTIVE_CASES');
    if (incidentWorkOrders.length) reasons.push('ACTIVE_INCIDENT_WORK_ORDERS');
    if (missingConnectors.length) reasons.push('CONNECTOR_SCOPE_MISMATCH');
    if (missingOffers.length) reasons.push('ENTITLEMENT_SCOPE_MISMATCH');
    const preservationRequired =
      evidenceCount > 0 ||
      activeLegalHolds.length > 0 ||
      activeAuditPackages.length > 0;
    const preservationVerified =
      !preservationRequired || remediation.preserveHistoricalEvidence === true;
    if (
      preservationRequired &&
      remediation.preserveHistoricalEvidence !== true
    ) {
      reasons.push('HISTORICAL_RETENTION_PRESERVATION_REQUIRED');
    }
    if (targetRetentionProfile) {
      await this.prisma.evidenceRetentionTransition.upsert({
        where: { amendment_id: amendment.id },
        create: {
          tenant_id: amendment.tenant_id!,
          environment_id: amendment.environment_id!,
          amendment_id: amendment.id,
          target_retention_profile: targetRetentionProfile,
          effective_at: amendment.effective_at!,
          historical_cutoff: amendment.effective_at!,
          historical_evidence_count: evidenceCount,
          preserved_retention_profiles: JSON.stringify(
            retentionProfiles.map((item) => item.retention_profile),
          ),
          legal_hold_ids: JSON.stringify(
            activeLegalHolds.map((hold) => hold.id),
          ),
          audit_package_ids: JSON.stringify(
            activeAuditPackages.map((pkg) => pkg.id),
          ),
          preservation_basis: JSON.stringify({
            originalRetentionProfiles: retentionProfiles.map(
              (item) => item.retention_profile,
            ),
            legalHolds: activeLegalHolds.map((hold) => hold.id),
            auditCycles: activeAuditPackages.map((pkg) => ({
              packageId: pkg.id,
              auditCycleReference: pkg.audit_cycle_reference,
              retainedUntil: pkg.retention_until,
            })),
          }),
          preserve_historical_evidence: true,
          status: preservationVerified ? 'VERIFIED' : 'PENDING_VERIFICATION',
          evidence_refs: JSON.stringify(remediation.evidenceRefs ?? []),
          verified_by: preservationVerified
            ? ((remediation.recordedBy as string | undefined) ??
              amendment.requested_by)
            : undefined,
          verified_at: preservationVerified ? new Date() : undefined,
        },
        update: {
          target_retention_profile: targetRetentionProfile,
          effective_at: amendment.effective_at!,
          historical_cutoff: amendment.effective_at!,
          historical_evidence_count: evidenceCount,
          preserved_retention_profiles: JSON.stringify(
            retentionProfiles.map((item) => item.retention_profile),
          ),
          legal_hold_ids: JSON.stringify(
            activeLegalHolds.map((hold) => hold.id),
          ),
          audit_package_ids: JSON.stringify(
            activeAuditPackages.map((pkg) => pkg.id),
          ),
          preservation_basis: JSON.stringify({
            originalRetentionProfiles: retentionProfiles.map(
              (item) => item.retention_profile,
            ),
            legalHolds: activeLegalHolds.map((hold) => hold.id),
            auditCycles: activeAuditPackages.map((pkg) => ({
              packageId: pkg.id,
              auditCycleReference: pkg.audit_cycle_reference,
              retainedUntil: pkg.retention_until,
            })),
          }),
          preserve_historical_evidence: true,
          status: preservationVerified ? 'VERIFIED' : 'PENDING_VERIFICATION',
          evidence_refs: JSON.stringify(remediation.evidenceRefs ?? []),
          verified_by: preservationVerified
            ? ((remediation.recordedBy as string | undefined) ??
              amendment.requested_by)
            : undefined,
          verified_at: preservationVerified ? new Date() : undefined,
        },
      });
    }
    const targetStatus = reasons.length ? 'REMEDIATION_REQUIRED' : 'SCHEDULED';
    return this.prisma.commercialAmendment.update({
      where: { id: amendmentId },
      data: {
        status: targetStatus,
        remediation_status: reasons.length ? 'REQUIRED' : 'SATISFIED',
        assessment_snapshot: JSON.stringify({
          assessedAt: new Date(),
          reasons,
          activeCases,
          incidentWorkOrders,
          activeLegalHolds: activeLegalHolds.map((hold) => hold.id),
          activeAuditPackages,
          retainedEvidenceRecords: evidenceCount,
          missingConnectors,
          missingOffers,
          historyTreatment: 'PRESERVE',
        }),
      },
      include: {
        subscription: true,
        activatedEntitlements: true,
        retentionTransition: true,
      },
    });
  }

  async recordDowngradeRemediation(
    amendmentId: string,
    tenantId: string,
    environmentId: string,
    recordedBy: string,
    dto: RecordDowngradeRemediationDto,
  ) {
    const amendment = await this.getAmendmentForTenant(
      amendmentId,
      tenantId,
      environmentId,
    );
    if (amendment.amendment_type !== 'DOWNGRADE') {
      throw new BadRequestException('Remediation only applies to downgrades');
    }
    if (!dto.preserveHistoricalEvidence) {
      throw new BadRequestException(
        'Downgrade remediation must preserve historical evidence',
      );
    }
    await this.prisma.commercialAmendment.update({
      where: { id: amendmentId },
      data: {
        remediation_plan: JSON.stringify({
          preserveHistoricalEvidence: true,
          actions: dto.actions,
          evidenceRefs: dto.evidenceRefs,
          recordedBy,
          recordedAt: new Date(),
        }),
        remediation_status: 'SUBMITTED',
      },
    });
    return this.assessDowngrade(amendmentId);
  }

  private async requireApprovedChange(amendment: {
    approval_id: string | null;
    id: string;
  }) {
    if (!amendment.approval_id) {
      throw new ConflictException('Amendment has no linked approval');
    }
    const approval = await this.approvalService.getApprovalById(
      amendment.approval_id,
    );
    if (
      approval.status !== 'APPROVED' ||
      approval.object_type !== 'CommercialAmendment' ||
      approval.object_id !== amendment.id
    ) {
      throw new ConflictException('Commercial amendment approval is not valid');
    }
    return approval;
  }

  async applyAmendment(amendmentId: string, actor: string) {
    let amendment = await this.getAmendmentById(amendmentId);
    if (amendment.subscription.status !== 'ACTIVE') {
      throw new ConflictException(
        `Subscription '${amendment.subscription.id}' is no longer ACTIVE`,
      );
    }
    if (!amendment.effective_at || amendment.effective_at > new Date()) {
      throw new ConflictException(
        'Amendment effective date has not been reached',
      );
    }
    const approval = await this.requireApprovedChange(amendment);
    await this.requireActiveBinding(
      amendment.subscription.commercial_account_id,
      amendment.tenant_id!,
      amendment.environment_id!,
    );

    if (amendment.amendment_type === 'DOWNGRADE') {
      amendment = await this.assessDowngrade(amendmentId);
      if (amendment.status !== 'SCHEDULED') {
        throw new ConflictException(
          'Downgrade safety checks still require remediation',
        );
      }
    } else if (
      amendment.status !== 'PENDING_ACTIVATION' ||
      !amendment.claim_eligibility ||
      !amendment.deployment_ready ||
      !amendment.service_capacity_ready
    ) {
      throw new ConflictException(
        'Upgrade is not ready: commercial, claim, deployment and service-capacity gates must all pass',
      );
    }

    const proposed = this.parseProposed(amendment);
    const now = new Date();
    if (amendment.amendment_type === 'UPGRADE') {
      const offers = proposed.offerTypes as string[];
      const collision = await this.prisma.entitlement.findFirst({
        where: {
          tenant_id: amendment.tenant_id!,
          offer_type: { in: offers },
          status: 'ACTIVE',
          effective_from: { lte: now },
          OR: [{ effective_to: null }, { effective_to: { gte: now } }],
        },
      });
      if (collision) {
        throw new ConflictException(
          `Tenant already has ACTIVE '${collision.offer_type}' scope`,
        );
      }
      return this.prisma.$transaction(async (tx) => {
        await tx.entitlement.createMany({
          data: offers.map((offerType) => ({
            commercial_account_id: amendment.subscription.commercial_account_id,
            tenant_id: amendment.tenant_id!,
            offer_type: offerType,
            source_type: 'SUBSCRIPTION_UPGRADE',
            source_id: amendment.id,
            activation_amendment_id: amendment.id,
            status: 'ACTIVE',
            effective_from: now,
          })),
        });
        const applied = await tx.commercialAmendment.update({
          where: { id: amendment.id },
          data: { status: 'APPLIED', applied_by: actor, applied_at: now },
        });
        await tx.commercialApproval.update({
          where: { id: approval.id },
          data: { status: 'APPLIED', applied_at: now },
        });
        await tx.commercialEvent.create({
          data: {
            event_type: 'subscription.upgrade_activated',
            tenant_id: amendment.tenant_id,
            actor,
            payload: JSON.stringify({ amendmentId, offers }),
            idempotency_key: `subscription-upgrade-activated-${amendmentId}`,
          },
        });
        return applied;
      });
    }

    const offers = (proposed.offerTypesToRemove ?? []) as string[];
    const connectorIds = (proposed.connectorIdsToDisable ?? []) as string[];
    const targetRetentionProfile = proposed.targetRetentionProfile as
      string | undefined;
    return this.prisma.$transaction(async (tx) => {
      if (offers.length) {
        await tx.entitlement.updateMany({
          where: {
            tenant_id: amendment.tenant_id!,
            offer_type: { in: offers },
            status: 'ACTIVE',
          },
          data: { status: 'EXPIRED', effective_to: now },
        });
      }
      if (connectorIds.length) {
        await tx.connectorInstance.updateMany({
          where: {
            id: { in: connectorIds },
            tenant_id: amendment.tenant_id!,
            environment_id: amendment.environment_id!,
            deletedAt: null,
          },
          data: { state: 'DISCONNECTED' },
        });
      }
      if (targetRetentionProfile) {
        if (
          !amendment.retentionTransition ||
          amendment.retentionTransition.status !== 'VERIFIED' ||
          amendment.retentionTransition.target_retention_profile !==
            targetRetentionProfile
        ) {
          throw new ConflictException(
            'Retention downgrade requires a verified prospective transition that preserves historical evidence, audit cycles and legal holds',
          );
        }
        const updated = await tx.$executeRaw`
          UPDATE "tenant"."tenants"
          SET "retentionPolicyRef" = ${targetRetentionProfile}, "updatedAt" = NOW()
          WHERE "id" = ${amendment.tenant_id}::uuid
        `;
        if (updated !== 1) {
          throw new ConflictException(
            'Tenant retention assignment was not found',
          );
        }
      }
      if (targetRetentionProfile) {
        await tx.evidenceRetentionTransition.update({
          where: { amendment_id: amendment.id },
          data: { status: 'APPLIED', applied_at: now },
        });
      }
      const applied = await tx.commercialAmendment.update({
        where: { id: amendment.id },
        data: { status: 'APPLIED', applied_by: actor, applied_at: now },
      });
      await tx.commercialApproval.update({
        where: { id: approval.id },
        data: { status: 'APPLIED', applied_at: now },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'subscription.downgrade_applied',
          tenant_id: amendment.tenant_id,
          actor,
          payload: JSON.stringify({
            amendmentId,
            offersExpired: offers,
            connectorsDisconnected: connectorIds,
            targetRetentionProfile,
            historicalEvidenceTreatment: 'PRESERVED',
          }),
          idempotency_key: `subscription-downgrade-applied-${amendmentId}`,
        },
      });
      return applied;
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async applyDueAmendments() {
    const due = await this.prisma.commercialAmendment.findMany({
      where: {
        status: { in: ['PENDING_ACTIVATION', 'SCHEDULED'] },
        effective_at: { lte: new Date() },
      },
      select: { id: true },
      take: 100,
    });
    const results = await Promise.allSettled(
      due.map((amendment) =>
        this.applyAmendment(
          amendment.id,
          'system:subscription-change-scheduler',
        ),
      ),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    failures.forEach((failure) => {
      if (failure.status === 'rejected') {
        this.logger.error(
          `Scheduled subscription change failed: ${
            failure.reason instanceof Error
              ? failure.reason.message
              : String(failure.reason)
          }`,
        );
      }
    });
    return {
      attempted: due.length,
      applied: results.length - failures.length,
      failed: failures.length,
    };
  }
}
