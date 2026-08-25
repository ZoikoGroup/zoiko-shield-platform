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
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const NO_LEGAL_DETERMINATION =
  'This work order does not establish legal privilege or provide a breach-notification, regulatory, or legal conclusion.';

const AUTHORITY_RANK: Record<string, number> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
};

export class ActivateWorkOrderDto {
  @IsUUID()
  retainerId!: string;

  @IsString()
  incidentReference!: string;

  @IsString()
  activationReason!: string;

  @IsString()
  activationReference!: string;

  @IsOptional()
  @IsIn(['R0', 'R1', 'R2', 'R3', 'R4'])
  responseAuthority?: string;

  @IsObject()
  authorityScope!: Record<string, unknown>;

  @IsObject()
  customerCommandStructure!: Record<string, unknown>;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  readinessEvidenceRefs!: string[];

  @IsOptional()
  @IsString()
  customerContact?: string;
}

export class LogHoursDto {
  @IsNumber()
  @IsPositive()
  hours!: number;

  @IsString()
  workDescription!: string;

  @IsString()
  evidenceReference!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedRemainingHours?: number;

  @IsOptional()
  @IsString()
  emergencyProvisionReference?: string;

  @IsOptional()
  @IsISO8601()
  occurredAt?: Date;
}

export class RequestIncidentOverageApprovalDto {
  @IsNumber()
  @IsPositive()
  maxOverageHours!: number;

  @IsString()
  namedCustomerAuthorizer!: string;

  @IsString()
  customerApprovalReference!: string;

  @IsString()
  reason!: string;
}

export class CloseIncidentWorkOrderDto {
  @IsString()
  closureSummary!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  evidenceRefs!: string[];

  @IsString()
  customerAcknowledgementRef!: string;
}

export class RequestEmergencyReconciliationDto {
  @IsIn(['INCLUDED_RETAINER', 'APPROVED_OVERAGE', 'WAIVED'])
  commercialTreatment!: 'INCLUDED_RETAINER' | 'APPROVED_OVERAGE' | 'WAIVED';

  @IsString()
  reconciliationReference!: string;

  @IsString()
  namedCustomerAuthorizer!: string;

  @IsString()
  reason!: string;
}

export class DecideEmergencyReconciliationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class RequestThirdPartyCostDto {
  @IsString()
  costType!: string;

  @IsString()
  supplierReference!: string;

  @IsString()
  contractPolicyReference!: string;

  @IsString()
  description!: string;

  @IsNumber()
  @IsPositive()
  baseAmount!: number;

  @IsNumber()
  @Min(0)
  markupPercent!: number;

  @IsString()
  currency!: string;

  @IsString()
  namedCustomerAuthorizer!: string;

  @IsString()
  customerApprovalReference!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  evidenceRefs!: string[];

  @IsISO8601()
  incurredAt!: Date;

  @IsString()
  reason!: string;
}

export class DecideThirdPartyCostDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class CreateIncidentLegalRecordDto {
  @IsUUID()
  workOrderId!: string;

  @IsIn([
    'INCIDENT_COUNSEL_COORDINATION',
    'BREACH_NOTIFICATION_ANALYSIS',
    'FORENSIC_LEGAL_REVIEW',
  ])
  purpose!: string;

  @IsIn(['NOT_ASSERTED', 'COUNSEL_ASSERTED'])
  privilegeStatus!: string;

  @IsIn(['NOT_DETERMINED', 'COUNSEL_DETERMINED'])
  notificationStatus!: string;

  @IsBoolean()
  counselControlled!: boolean;

  @IsOptional()
  @IsString()
  separateLegalServiceRef?: string;

  @IsOptional()
  @IsString()
  counselActorRef?: string;

  @IsOptional()
  @IsString()
  conclusionReference?: string;

  @IsString()
  contentReference!: string;

  @IsString()
  accessReason!: string;
}

/**
 * G1/G2 operating authority. Security work continues only within contracted
 * authority; consumption or cost records never create an invoice by themselves.
 */
@Injectable()
export class IncidentWorkOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: CommercialApprovalService,
  ) {}

  private required(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized)
      throw new BadRequestException(`${field} must be non-empty`);
    return normalized;
  }

  private uniqueStrings(values: string[], field: string) {
    const normalized = [...new Set(values.map((value) => value.trim()))].filter(
      Boolean,
    );
    if (!normalized.length || normalized.length !== values.length) {
      throw new BadRequestException(
        `${field} must contain unique non-empty values`,
      );
    }
    return normalized;
  }

  private validateCommandStructure(value: Record<string, unknown>) {
    for (const key of [
      'incidentCommander',
      'customerDecisionAuthority',
      'communicationsChannel',
      'escalationContact',
    ]) {
      if (typeof value[key] !== 'string' || !(value[key] as string).trim()) {
        throw new BadRequestException(
          `customerCommandStructure.${key} must be a non-empty string`,
        );
      }
    }
  }

  private validateAuthorityScope(value: Record<string, unknown>) {
    for (const key of [
      'allowedActions',
      'prohibitedActions',
      'customerApprovalRequiredActions',
    ]) {
      const entries = value[key];
      if (
        !Array.isArray(entries) ||
        entries.some((entry) => typeof entry !== 'string' || !entry.trim())
      ) {
        throw new BadRequestException(
          `authorityScope.${key} must be an explicit string array`,
        );
      }
    }
  }

  private async requireWorkOrder(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const workOrder = await this.prisma.incidentWorkOrder.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
      include: { retainer: true },
    });
    if (
      !workOrder ||
      !workOrder.tenant_id ||
      !workOrder.environment_id ||
      !workOrder.retainer
    ) {
      throw new NotFoundException(`Incident work order '${id}' not found`);
    }
    return workOrder;
  }

  async activate(
    tenantId: string,
    environmentId: string,
    authorizedBy: string,
    dto: ActivateWorkOrderDto,
  ) {
    const incidentReference = this.required(
      dto.incidentReference,
      'incidentReference',
    );
    const activationReason = this.required(
      dto.activationReason,
      'activationReason',
    );
    const activationReference = this.required(
      dto.activationReference,
      'activationReference',
    );
    this.validateAuthorityScope(dto.authorityScope);
    this.validateCommandStructure(dto.customerCommandStructure);
    const readinessEvidenceRefs = this.uniqueStrings(
      dto.readinessEvidenceRefs,
      'readinessEvidenceRefs',
    );
    const now = new Date();
    const retainer = await this.prisma.incidentResponseRetainer.findFirst({
      where: {
        id: dto.retainerId,
        tenant_id: tenantId,
        environment_id: environmentId,
        status: 'ACTIVE',
        term_start: { lte: now },
        term_end: { gte: now },
      },
    });
    if (!retainer) {
      throw new ConflictException(
        'Incident activation requires an ACTIVE tenant-bound retainer covering the current date',
      );
    }
    const obligation = await this.prisma.serviceObligation.findFirst({
      where: {
        id: retainer.service_obligation_id,
        tenant_id: tenantId,
        environment_id: environmentId,
        contract_id: retainer.contract_id,
        obligation_type: 'IR_RETAINER',
        status: 'ACTIVE',
      },
    });
    if (!obligation) {
      throw new ConflictException(
        'Incident activation requires its ACTIVE IR_RETAINER service obligation',
      );
    }
    const responseAuthority = dto.responseAuthority ?? 'R1';
    if (
      AUTHORITY_RANK[responseAuthority] >
      AUTHORITY_RANK[retainer.maximum_response_authority]
    ) {
      throw new ConflictException(
        'Requested response authority exceeds the approved retainer authority',
      );
    }
    const existing = await this.prisma.incidentWorkOrder.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        incident_reference: incidentReference,
        status: { notIn: ['CLOSED', 'MIGRATION_REVIEW'] },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Incident '${incidentReference}' already has active work order '${existing.id}'`,
      );
    }
    return this.prisma.incidentWorkOrder.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        retainer_id: retainer.id,
        contract_id: retainer.contract_id,
        incident_reference: incidentReference,
        activation_reason: activationReason,
        activation_reference: activationReference,
        response_authority: responseAuthority,
        authority_scope: JSON.stringify(dto.authorityScope),
        activated_at: now,
        started_at: now,
        authorized_by: authorizedBy,
        customer_command_structure: JSON.stringify(
          dto.customerCommandStructure,
        ),
        included_services: retainer.included_services,
        response_window: retainer.response_window,
        included_hours: retainer.included_hours,
        consumed_hours: 0,
        overage_hours: 0,
        forecast_hours: 0,
        warning_threshold_percent: retainer.warning_threshold_percent,
        threshold_state: 'WITHIN_ALLOWANCE',
        overage_policy: retainer.overage_policy,
        overage_cap_hours: retainer.overage_cap_hours,
        customer_contact: dto.customerContact?.trim(),
        evidence_refs: JSON.stringify(readinessEvidenceRefs),
        no_privilege_or_notification_determination: NO_LEGAL_DETERMINATION,
        status: 'ACTIVE',
      },
    });
  }

  getWorkOrderById(id: string, tenantId: string, environmentId: string) {
    return this.requireWorkOrder(id, tenantId, environmentId);
  }

  listConsumption(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
  ) {
    return this.requireWorkOrder(workOrderId, tenantId, environmentId).then(
      () =>
        this.prisma.incidentWorkOrderConsumption.findMany({
          where: {
            work_order_id: workOrderId,
            tenant_id: tenantId,
            environment_id: environmentId,
          },
          orderBy: [{ occurred_at: 'asc' }, { created_at: 'asc' }],
        }),
    );
  }

  async logHours(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
    actorId: string,
    dto: LogHoursDto,
  ) {
    const workDescription = this.required(
      dto.workDescription,
      'workDescription',
    );
    const evidenceReference = this.required(
      dto.evidenceReference,
      'evidenceReference',
    );
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime()) || occurredAt > new Date()) {
      throw new BadRequestException(
        'occurredAt must be a valid past timestamp',
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        const workOrder = await tx.incidentWorkOrder.findFirst({
          where: {
            id: workOrderId,
            tenant_id: tenantId,
            environment_id: environmentId,
          },
          include: { retainer: true },
        });
        if (
          !workOrder ||
          !workOrder.tenant_id ||
          !workOrder.environment_id ||
          !workOrder.retainer
        ) {
          throw new NotFoundException(
            `Incident work order '${workOrderId}' not found`,
          );
        }
        if (
          !['ACTIVE', 'AWAITING_CUSTOMER', 'CONTAINMENT', 'RECOVERY'].includes(
            workOrder.status,
          )
        ) {
          throw new ConflictException(
            `Work order '${workOrderId}' is '${workOrder.status}' and cannot accept consumption`,
          );
        }
        const included = Number(workOrder.included_hours);
        const consumed = Number(workOrder.consumed_hours);
        const newTotal = consumed + dto.hours;
        const overageHours = Math.max(0, newTotal - included);
        const forecastHours =
          newTotal + Math.max(0, dto.expectedRemainingHours ?? 0);
        let entryType = 'STANDARD';
        let overageApprovalId: string | undefined;
        let emergencyProvisionRef: string | undefined;
        if (overageHours > 0) {
          let allowed = false;
          let policyReason = 'OVERAGE_BLOCKED';
          if (workOrder.overage_policy === 'ALLOW_CAPPED') {
            allowed = overageHours <= Number(workOrder.overage_cap_hours ?? 0);
            policyReason = 'OVERAGE_CAP_EXCEEDED';
            if (allowed) entryType = 'PREAUTHORIZED_OVERAGE';
          } else if (workOrder.overage_policy === 'REQUIRE_APPROVAL') {
            const approval = await tx.commercialApproval.findFirst({
              where: {
                tenant_id: tenantId,
                object_type: 'IncidentWorkOrder',
                object_id: workOrderId,
                change_type: 'OVERAGE_OVERRIDE',
                status: 'APPROVED',
                OR: [{ expires_at: null }, { expires_at: { gte: new Date() } }],
              },
              orderBy: { requested_at: 'desc' },
            });
            if (approval) {
              const approvedScope = JSON.parse(
                approval.proposed_snapshot || '{}',
              ) as { maxOverageHours?: number };
              allowed =
                typeof approvedScope.maxOverageHours === 'number' &&
                overageHours <= approvedScope.maxOverageHours;
              if (allowed) {
                entryType = 'APPROVED_OVERAGE';
                overageApprovalId = approval.id;
              }
            }
            policyReason = 'OVERAGE_REQUIRES_NAMED_APPROVAL';
          }
          if (!allowed && dto.emergencyProvisionReference) {
            const emergency = JSON.parse(
              workOrder.retainer.emergency_provision,
            ) as {
              enabled?: boolean;
              contractReference?: string;
              reconciliationRequired?: boolean;
            };
            if (
              emergency.enabled === true &&
              emergency.reconciliationRequired === true &&
              emergency.contractReference ===
                dto.emergencyProvisionReference.trim()
            ) {
              allowed = true;
              entryType = 'EMERGENCY_CONTINUITY';
              emergencyProvisionRef = emergency.contractReference;
            }
          }
          if (!allowed) {
            throw new ConflictException({
              statusCode: 409,
              error: policyReason,
              message:
                'Hours beyond the included allowance require a valid pre-authorized cap, named approval, or matching emergency contractual provision',
            });
          }
        }
        const warningAt =
          included * (workOrder.warning_threshold_percent / 100);
        const thresholdState =
          overageHours > 0
            ? 'OVERAGE'
            : forecastHours >= warningAt
              ? 'WARNING'
              : 'WITHIN_ALLOWANCE';
        const consumption = await tx.incidentWorkOrderConsumption.create({
          data: {
            tenant_id: tenantId,
            environment_id: environmentId,
            work_order_id: workOrder.id,
            entry_type: entryType,
            hours: dto.hours,
            included_total_after: Math.min(newTotal, included),
            overage_total_after: overageHours,
            forecast_hours_after: forecastHours,
            threshold_state: thresholdState,
            overage_approval_id: overageApprovalId,
            emergency_provision_ref: emergencyProvisionRef,
            work_description: workDescription,
            evidence_reference: evidenceReference,
            actor_id: actorId,
            occurred_at: occurredAt,
          },
        });
        const updated = await tx.incidentWorkOrder.update({
          where: { id: workOrder.id },
          data: {
            consumed_hours: newTotal,
            overage_hours: overageHours,
            forecast_hours: forecastHours,
            threshold_state: thresholdState,
            evidence_refs: JSON.stringify([
              ...new Set([
                ...(JSON.parse(workOrder.evidence_refs) as string[]),
                evidenceReference,
              ]),
            ]),
            ...(entryType === 'EMERGENCY_CONTINUITY'
              ? {
                  emergency_provision_reference: emergencyProvisionRef,
                  emergency_reconciliation_status: 'REQUIRED',
                }
              : {}),
          },
        });
        return { workOrder: updated, consumption };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async requestOverageApproval(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: RequestIncidentOverageApprovalDto,
  ) {
    const workOrder = await this.requireWorkOrder(
      workOrderId,
      tenantId,
      environmentId,
    );
    if (workOrder.status === 'CLOSED') {
      throw new ConflictException('Closed work orders cannot request overage');
    }
    if (workOrder.overage_policy !== 'REQUIRE_APPROVAL') {
      throw new ConflictException(
        'Named overage approval is only available when the contracted policy requires approval',
      );
    }
    if (
      workOrder.overage_cap_hours &&
      dto.maxOverageHours > Number(workOrder.overage_cap_hours)
    ) {
      throw new ConflictException(
        'Requested overage exceeds the contracted retainer cap',
      );
    }
    return this.approvalService.requestApproval({
      changeType: 'OVERAGE_OVERRIDE',
      objectType: 'IncidentWorkOrder',
      objectId: workOrderId,
      tenantId,
      requestedBy,
      reason: this.required(dto.reason, 'reason'),
      proposedSnapshot: {
        maxOverageHours: dto.maxOverageHours,
        namedCustomerAuthorizer: this.required(
          dto.namedCustomerAuthorizer,
          'namedCustomerAuthorizer',
        ),
        customerApprovalReference: this.required(
          dto.customerApprovalReference,
          'customerApprovalReference',
        ),
        includedHours: Number(workOrder.included_hours),
        consumedHours: Number(workOrder.consumed_hours),
        forecastHours: Number(workOrder.forecast_hours),
      },
      requiredApprovalRole: 'COMMERCIAL_APPROVER',
    });
  }

  async close(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
    dto: CloseIncidentWorkOrderDto,
  ) {
    const workOrder = await this.requireWorkOrder(
      workOrderId,
      tenantId,
      environmentId,
    );
    if (
      !['ACTIVE', 'AWAITING_CUSTOMER', 'CONTAINMENT', 'RECOVERY'].includes(
        workOrder.status,
      )
    ) {
      throw new ConflictException(
        `Work order '${workOrderId}' cannot close from '${workOrder.status}'`,
      );
    }
    const evidenceRefs = this.uniqueStrings(dto.evidenceRefs, 'evidenceRefs');
    return this.prisma.incidentWorkOrder.update({
      where: { id: workOrderId },
      data: {
        status: 'CLOSED',
        closure_summary: this.required(dto.closureSummary, 'closureSummary'),
        closure_evidence_refs: JSON.stringify(evidenceRefs),
        customer_acknowledgement_ref: this.required(
          dto.customerAcknowledgementRef,
          'customerAcknowledgementRef',
        ),
        evidence_refs: JSON.stringify([
          ...new Set([
            ...(JSON.parse(workOrder.evidence_refs) as string[]),
            ...evidenceRefs,
          ]),
        ]),
        closed_at: new Date(),
      },
    });
  }

  async requestEmergencyReconciliation(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: RequestEmergencyReconciliationDto,
  ) {
    const workOrder = await this.requireWorkOrder(
      workOrderId,
      tenantId,
      environmentId,
    );
    if (
      workOrder.status !== 'CLOSED' ||
      workOrder.emergency_reconciliation_status !== 'REQUIRED' ||
      workOrder.emergency_reconciliation_approval_id
    ) {
      throw new ConflictException(
        'Emergency reconciliation requires a CLOSED work order with unreconciled emergency consumption',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const approval = await this.approvalService.requestApproval(
        {
          changeType: 'IR_EMERGENCY_RECONCILIATION',
          objectType: 'IncidentWorkOrder',
          objectId: workOrder.id,
          tenantId,
          requestedBy,
          reason: this.required(dto.reason, 'reason'),
          proposedSnapshot: {
            commercialTreatment: dto.commercialTreatment,
            reconciliationReference: this.required(
              dto.reconciliationReference,
              'reconciliationReference',
            ),
            namedCustomerAuthorizer: this.required(
              dto.namedCustomerAuthorizer,
              'namedCustomerAuthorizer',
            ),
            consumedHours: Number(workOrder.consumed_hours),
            overageHours: Number(workOrder.overage_hours),
            thirdPartyCosts: Number(workOrder.third_party_costs),
            noAutomaticInvoice: true,
          },
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
        },
        tx,
      );
      return tx.incidentWorkOrder.update({
        where: { id: workOrder.id },
        data: {
          emergency_reconciliation_status: 'PENDING_APPROVAL',
          emergency_reconciliation_approval_id: approval.id,
          emergency_reconciliation_reference:
            dto.reconciliationReference.trim(),
        },
      });
    });
  }

  async decideEmergencyReconciliation(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
    approvedBy: string,
    dto: DecideEmergencyReconciliationDto,
  ) {
    const workOrder = await this.requireWorkOrder(
      workOrderId,
      tenantId,
      environmentId,
    );
    if (
      workOrder.emergency_reconciliation_status !== 'PENDING_APPROVAL' ||
      !workOrder.emergency_reconciliation_approval_id
    ) {
      throw new ConflictException(
        'Work order has no pending emergency reconciliation',
      );
    }
    await this.approvalService.decideApproval(
      workOrder.emergency_reconciliation_approval_id,
      approvedBy,
      dto.decision,
      this.required(dto.reason, 'reason'),
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.incidentWorkOrder.update({
        where: { id: workOrder.id },
        data:
          dto.decision === 'APPROVED'
            ? {
                emergency_reconciliation_status: 'RECONCILED',
                emergency_reconciled_by: approvedBy,
                emergency_reconciled_at: new Date(),
              }
            : {
                emergency_reconciliation_status: 'REQUIRED',
                emergency_reconciliation_approval_id: null,
              },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: workOrder.emergency_reconciliation_approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async requestThirdPartyCost(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: RequestThirdPartyCostDto,
  ) {
    const workOrder = await this.requireWorkOrder(
      workOrderId,
      tenantId,
      environmentId,
    );
    const policy = JSON.parse(workOrder.retainer!.third_party_cost_policy) as {
      enabled?: boolean;
      contractReference?: string;
      maxMarkupPercent?: number;
      requiresNamedApproval?: boolean;
    };
    if (
      policy.enabled !== true ||
      policy.requiresNamedApproval !== true ||
      policy.contractReference !== dto.contractPolicyReference.trim() ||
      typeof policy.maxMarkupPercent !== 'number' ||
      dto.markupPercent > policy.maxMarkupPercent
    ) {
      throw new ConflictException(
        'Third-party cost is outside the contracted pass-through and markup policy',
      );
    }
    const evidenceRefs = this.uniqueStrings(dto.evidenceRefs, 'evidenceRefs');
    const incurredAt = new Date(dto.incurredAt);
    if (Number.isNaN(incurredAt.getTime()) || incurredAt > new Date()) {
      throw new BadRequestException(
        'incurredAt must be a valid past timestamp',
      );
    }
    const customerAmount = Number(
      (dto.baseAmount * (1 + dto.markupPercent / 100)).toFixed(4),
    );
    return this.prisma.$transaction(async (tx) => {
      const cost = await tx.thirdPartyPassThroughCost.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          work_order_id: workOrder.id,
          cost_type: this.required(dto.costType, 'costType'),
          supplier_reference: this.required(
            dto.supplierReference,
            'supplierReference',
          ),
          contract_policy_reference: dto.contractPolicyReference.trim(),
          description: this.required(dto.description, 'description'),
          base_amount: dto.baseAmount,
          markup_percent: dto.markupPercent,
          customer_amount: customerAmount,
          currency: this.required(dto.currency, 'currency').toUpperCase(),
          named_customer_authorizer: this.required(
            dto.namedCustomerAuthorizer,
            'namedCustomerAuthorizer',
          ),
          customer_approval_reference: this.required(
            dto.customerApprovalReference,
            'customerApprovalReference',
          ),
          requested_by: requestedBy,
          evidence_refs: JSON.stringify(evidenceRefs),
          incurred_at: incurredAt,
        },
      });
      const approval = await this.approvalService.requestApproval(
        {
          changeType: 'THIRD_PARTY_PASS_THROUGH',
          objectType: 'ThirdPartyPassThroughCost',
          objectId: cost.id,
          tenantId,
          requestedBy,
          reason: this.required(dto.reason, 'reason'),
          proposedSnapshot: {
            workOrderId,
            contractPolicyReference: dto.contractPolicyReference,
            supplierReference: dto.supplierReference,
            baseAmount: dto.baseAmount,
            markupPercent: dto.markupPercent,
            customerAmount,
            currency: dto.currency.toUpperCase(),
            namedCustomerAuthorizer: dto.namedCustomerAuthorizer,
            customerApprovalReference: dto.customerApprovalReference,
            noAutomaticInvoice: true,
          },
          financialImpact: customerAmount,
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
        },
        tx,
      );
      return tx.thirdPartyPassThroughCost.update({
        where: { id: cost.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async decideThirdPartyCost(
    workOrderId: string,
    costId: string,
    tenantId: string,
    environmentId: string,
    approvedBy: string,
    dto: DecideThirdPartyCostDto,
  ) {
    await this.requireWorkOrder(workOrderId, tenantId, environmentId);
    const cost = await this.prisma.thirdPartyPassThroughCost.findFirst({
      where: {
        id: costId,
        work_order_id: workOrderId,
        tenant_id: tenantId,
        environment_id: environmentId,
      },
    });
    if (!cost) {
      throw new NotFoundException(`Third-party cost '${costId}' not found`);
    }
    if (cost.status !== 'PENDING_APPROVAL' || !cost.approval_id) {
      throw new ConflictException(
        `Third-party cost '${costId}' has no pending approval`,
      );
    }
    await this.approvalService.decideApproval(
      cost.approval_id,
      approvedBy,
      dto.decision,
      this.required(dto.reason, 'reason'),
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.thirdPartyPassThroughCost.update({
        where: { id: cost.id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'APPROVED',
                approved_by: approvedBy,
                approved_at: new Date(),
              }
            : { status: 'REJECTED' },
      });
      if (dto.decision === 'APPROVED') {
        await tx.incidentWorkOrder.update({
          where: { id: workOrderId },
          data: { third_party_costs: { increment: cost.customer_amount } },
        });
        await tx.commercialApproval.update({
          where: { id: cost.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }

  async createLegalSensitiveRecord(
    tenantId: string,
    environmentId: string,
    recordedBy: string,
    dto: CreateIncidentLegalRecordDto,
  ) {
    const workOrder = await this.requireWorkOrder(
      dto.workOrderId,
      tenantId,
      environmentId,
    );
    const legalScope = JSON.parse(workOrder.retainer!.legal_service_scope) as {
      included?: boolean;
      counselControlled?: boolean;
      contractReference?: string;
    };
    const assertsLegalConclusion =
      dto.privilegeStatus === 'COUNSEL_ASSERTED' ||
      dto.notificationStatus === 'COUNSEL_DETERMINED';
    const requiresContractedLegalScope =
      dto.counselControlled === true || assertsLegalConclusion;
    if (
      requiresContractedLegalScope &&
      (dto.counselControlled !== true ||
        legalScope.included !== true ||
        legalScope.counselControlled !== true ||
        !dto.separateLegalServiceRef?.trim() ||
        dto.separateLegalServiceRef !== legalScope.contractReference ||
        !dto.counselActorRef?.trim())
    ) {
      throw new ConflictException(
        'Counsel control requires separately contracted legal service and counsel references',
      );
    }
    if (assertsLegalConclusion && !dto.conclusionReference?.trim()) {
      throw new ConflictException(
        'Privilege or notification determinations require a counsel conclusion reference',
      );
    }
    const accessReason = this.required(dto.accessReason, 'accessReason');
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.incidentLegalSensitiveRecord.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          work_order_id: workOrder.id,
          purpose: dto.purpose,
          privilege_status: dto.privilegeStatus,
          notification_status: dto.notificationStatus,
          counsel_controlled: dto.counselControlled,
          separate_legal_service_ref: dto.separateLegalServiceRef?.trim(),
          counsel_actor_ref: dto.counselActorRef?.trim(),
          conclusion_reference: dto.conclusionReference?.trim(),
          content_reference: this.required(
            dto.contentReference,
            'contentReference',
          ),
          access_reason: accessReason,
          no_legal_advice_wording: NO_LEGAL_DETERMINATION,
          recorded_by: recordedBy,
        },
      });
      await tx.incidentLegalAccessEvent.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          legal_record_id: record.id,
          action: 'CREATE',
          purpose: dto.purpose,
          access_reason: accessReason,
          actor_id: recordedBy,
        },
      });
      return record;
    });
  }

  async listLegalSensitiveRecords(
    workOrderId: string,
    tenantId: string,
    environmentId: string,
    actorId: string,
    accessReasonValue: string,
  ) {
    await this.requireWorkOrder(workOrderId, tenantId, environmentId);
    const accessReason = this.required(accessReasonValue, 'accessReason');
    return this.prisma.$transaction(async (tx) => {
      const records = await tx.incidentLegalSensitiveRecord.findMany({
        where: {
          work_order_id: workOrderId,
          tenant_id: tenantId,
          environment_id: environmentId,
        },
        orderBy: { recorded_at: 'desc' },
      });
      if (records.length) {
        await tx.incidentLegalAccessEvent.createMany({
          data: records.map((record) => ({
            tenant_id: tenantId,
            environment_id: environmentId,
            legal_record_id: record.id,
            action: 'READ',
            purpose: record.purpose,
            access_reason: accessReason,
            actor_id: actorId,
          })),
        });
      }
      return records;
    });
  }
}
