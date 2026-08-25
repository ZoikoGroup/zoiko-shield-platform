import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const DATA_DECISIONS = [
  'RETAIN_HISTORICAL_AT_SOURCE',
  'EXPORT_COPY_AND_RETAIN_SOURCE',
] as const;
const EXPORT_DECISIONS = ['NOT_REQUIRED', 'REQUIRED_BEFORE_EXECUTION'] as const;
const LEGAL_HOLD_DECISIONS = ['PRESERVE_IN_SOURCE', 'NOT_APPLICABLE'] as const;

export class TransferEntitlementMappingDto {
  @IsString()
  @IsNotEmpty()
  sourceEntitlementId!: string;

  @IsString()
  @IsNotEmpty()
  targetOfferType!: string;
}

export class CreateCorporateTransferDto {
  @IsString()
  @IsNotEmpty()
  sourceCommercialAccountId!: string;

  @IsString()
  @IsNotEmpty()
  sourceBindingId!: string;

  @IsString()
  @IsNotEmpty()
  targetCommercialAccountId!: string;

  @IsString()
  @IsNotEmpty()
  targetTenantId!: string;

  @IsString()
  @IsNotEmpty()
  targetEnvironmentId!: string;

  @IsString()
  @IsNotEmpty()
  targetLegalEntityId!: string;

  @IsOptional()
  @IsString()
  targetBusinessUnitId?: string;

  @IsString()
  @IsNotEmpty()
  targetRegion!: string;

  @IsString()
  @IsNotEmpty()
  targetResidencyPolicy!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetServiceScope!: string[];

  @IsISO8601()
  effectiveAt!: string;

  @IsIn(DATA_DECISIONS)
  dataDecision!: (typeof DATA_DECISIONS)[number];

  @IsIn(EXPORT_DECISIONS)
  exportDecision!: (typeof EXPORT_DECISIONS)[number];

  @IsOptional()
  @IsString()
  exportManifestId?: string;

  @IsIn(LEGAL_HOLD_DECISIONS)
  legalHoldDecision!: (typeof LEGAL_HOLD_DECISIONS)[number];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferEntitlementMappingDto)
  entitlementMapping!: TransferEntitlementMappingDto[];

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsISO8601()
  approvalExpiresAt?: string;
}

export class DecideCorporateTransferDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ReconcileCorporateTransferDto {
  @IsIn(['PASS', 'PASS_WITH_EXCEPTIONS'])
  outcome!: 'PASS' | 'PASS_WITH_EXCEPTIONS';

  @IsString()
  @IsNotEmpty()
  notes!: string;
}

@Injectable()
export class CorporateTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvalService: CommercialApprovalService,
  ) {}

  async requestTransfer(
    sourceTenantId: string,
    sourceEnvironmentId: string | null,
    actorId: string,
    dto: CreateCorporateTransferDto,
  ) {
    const environment = this.requireEnvironment(sourceEnvironmentId);
    const effectiveAt = new Date(dto.effectiveAt);
    if (
      Number.isNaN(effectiveAt.getTime()) ||
      effectiveAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('effectiveAt must be in the future');
    }
    if (
      dto.sourceCommercialAccountId === dto.targetCommercialAccountId &&
      sourceTenantId === dto.targetTenantId &&
      environment === dto.targetEnvironmentId
    ) {
      throw new BadRequestException(
        'Source and target commercial boundaries must be different',
      );
    }
    this.assertUniqueMappings(dto.entitlementMapping);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const [
        sourceBinding,
        sourceBindings,
        targetAccount,
        entitlements,
        holds,
      ] = await Promise.all([
        tx.commercialAccountTenantBinding.findFirst({
          where: {
            id: dto.sourceBindingId,
            commercial_account_id: dto.sourceCommercialAccountId,
            tenant_id: sourceTenantId,
            environment_id: environment,
            status: 'ACTIVE',
            effective_from: { lte: now },
            OR: [{ effective_to: null }, { effective_to: { gt: now } }],
          },
        }),
        tx.commercialAccountTenantBinding.findMany({
          where: {
            commercial_account_id: dto.sourceCommercialAccountId,
            tenant_id: sourceTenantId,
            status: 'ACTIVE',
            effective_from: { lte: now },
            OR: [{ effective_to: null }, { effective_to: { gt: now } }],
          },
          select: { id: true },
        }),
        tx.commercialAccount.findFirst({
          where: { id: dto.targetCommercialAccountId, status: 'ACTIVE' },
          select: { id: true },
        }),
        tx.entitlement.findMany({
          where: {
            id: {
              in: dto.entitlementMapping.map(
                (mapping) => mapping.sourceEntitlementId,
              ),
            },
            commercial_account_id: dto.sourceCommercialAccountId,
            tenant_id: sourceTenantId,
            status: 'ACTIVE',
            effective_from: { lte: now },
            OR: [{ effective_to: null }, { effective_to: { gt: now } }],
          },
        }),
        tx.legalHold.findMany({
          where: { tenant_id: sourceTenantId, status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);

      if (!sourceBinding) {
        throw new NotFoundException(
          `Source binding '${dto.sourceBindingId}' not found`,
        );
      }
      if (sourceBindings.length !== 1) {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSFER_BOUNDARY_AMBIGUOUS',
          message:
            'The source account has multiple active tenant bindings; partition entitlements into an unambiguous commercial account before transfer',
        });
      }
      if (!targetAccount) {
        throw new NotFoundException(
          `Active target commercial account '${dto.targetCommercialAccountId}' not found`,
        );
      }
      if (entitlements.length !== dto.entitlementMapping.length) {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSFER_ENTITLEMENT_SCOPE_INVALID',
          message:
            'Every mapped source entitlement must be active and belong to the source account and tenant',
        });
      }
      if (holds.length && dto.legalHoldDecision !== 'PRESERVE_IN_SOURCE') {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSFER_LEGAL_HOLD_DECISION_REQUIRED',
          message:
            'Active legal holds exist; the plan must preserve held material in the source tenant',
        });
      }
      if (!holds.length && dto.legalHoldDecision === 'PRESERVE_IN_SOURCE') {
        // Explicit preservation remains valid: a hold may arise before execution.
      }
      if (dto.exportDecision === 'REQUIRED_BEFORE_EXECUTION') {
        if (!dto.exportManifestId) {
          throw new BadRequestException(
            'exportManifestId is required when export is a prerequisite',
          );
        }
        const manifest = await tx.exportManifest.findFirst({
          where: {
            id: dto.exportManifestId,
            tenant_id: sourceTenantId,
            completeness_state: 'COMPLETE',
          },
          select: { id: true },
        });
        if (!manifest) {
          throw new ConflictException(
            'A complete source-tenant export manifest is required',
          );
        }
      }

      const transfer = await tx.corporateTransfer.create({
        data: {
          source_commercial_account_id: dto.sourceCommercialAccountId,
          source_binding_id: sourceBinding.id,
          source_tenant_id: sourceTenantId,
          source_environment_id: environment,
          source_binding_updated_at: sourceBinding.updated_at,
          target_commercial_account_id: dto.targetCommercialAccountId,
          target_tenant_id: dto.targetTenantId,
          target_environment_id: dto.targetEnvironmentId,
          target_legal_entity_id: dto.targetLegalEntityId,
          target_business_unit_id: dto.targetBusinessUnitId,
          target_region: dto.targetRegion,
          target_residency_policy: dto.targetResidencyPolicy,
          target_service_scope: JSON.stringify([
            ...new Set(dto.targetServiceScope),
          ]),
          effective_at: effectiveAt,
          data_decision: dto.dataDecision,
          export_decision: dto.exportDecision,
          export_manifest_id: dto.exportManifestId,
          legal_hold_decision: dto.legalHoldDecision,
          legal_hold_references: JSON.stringify(holds.map((hold) => hold.id)),
          entitlement_mapping: JSON.stringify(dto.entitlementMapping),
          evidence_lineage_policy: 'PRESERVE_SOURCE_IDENTIFIERS',
          status: 'PENDING_APPROVAL',
          requested_by: actorId,
        },
      });
      const approvalExpiresAt = dto.approvalExpiresAt
        ? new Date(dto.approvalExpiresAt)
        : undefined;
      if (approvalExpiresAt && approvalExpiresAt >= effectiveAt) {
        throw new BadRequestException(
          'approvalExpiresAt must be earlier than effectiveAt',
        );
      }
      const snapshot = this.planSnapshot(transfer);
      const sourceApproval = await this.approvalService.requestApproval(
        {
          changeType: 'CORPORATE_TRANSFER',
          objectType: 'CorporateTransfer',
          objectId: transfer.id,
          tenantId: sourceTenantId,
          requestedBy: actorId,
          reason: dto.reason,
          beforeSnapshot: {
            sourceBindingId: sourceBinding.id,
            sourceBindingUpdatedAt: sourceBinding.updated_at.toISOString(),
          },
          proposedSnapshot: snapshot,
          requiredApprovalRole: 'COMMERCIAL_ACCOUNT_OWNER',
          expiresAt: approvalExpiresAt,
        },
        tx,
      );
      const targetApproval =
        dto.targetTenantId !== sourceTenantId
          ? await this.approvalService.requestApproval(
              {
                changeType: 'CORPORATE_TRANSFER',
                objectType: 'CorporateTransfer',
                objectId: transfer.id,
                tenantId: dto.targetTenantId,
                requestedBy: actorId,
                reason: dto.reason,
                proposedSnapshot: snapshot,
                requiredApprovalRole: 'COMMERCIAL_ACCOUNT_OWNER',
                expiresAt: approvalExpiresAt,
              },
              tx,
            )
          : null;
      const updated = await tx.corporateTransfer.update({
        where: { id: transfer.id },
        data: {
          source_approval_id: sourceApproval.id,
          target_approval_id: targetApproval?.id,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'corporate_transfer.requested',
          tenant_id: sourceTenantId,
          actor: actorId,
          idempotency_key: `corporate-transfer-requested-${transfer.id}`,
          payload: JSON.stringify({
            transferId: transfer.id,
            sourceApprovalId: sourceApproval.id,
            targetApprovalId: targetApproval?.id,
            effectiveAt: effectiveAt.toISOString(),
          }),
        },
      });
      return this.view(updated);
    });
  }

  async listForParticipant(
    tenantId: string,
    environmentId: string | null,
    commercialAccountId?: string,
  ) {
    const environment = this.requireEnvironment(environmentId);
    const transfers = await this.prisma.corporateTransfer.findMany({
      where: {
        OR: [
          {
            source_tenant_id: tenantId,
            source_environment_id: environment,
            ...(commercialAccountId
              ? { source_commercial_account_id: commercialAccountId }
              : {}),
          },
          {
            target_tenant_id: tenantId,
            target_environment_id: environment,
            ...(commercialAccountId
              ? { target_commercial_account_id: commercialAccountId }
              : {}),
          },
        ],
      },
      orderBy: { requested_at: 'desc' },
    });
    return transfers.map((transfer) => this.view(transfer));
  }

  async decideTransfer(
    transferId: string,
    tenantId: string,
    environmentId: string | null,
    actorId: string,
    dto: DecideCorporateTransferDto,
  ) {
    const transfer = await this.getParticipant(
      transferId,
      tenantId,
      environmentId,
    );
    const sourceParticipant =
      transfer.source_tenant_id === tenantId &&
      transfer.source_environment_id === environmentId;
    const approvalId = sourceParticipant
      ? transfer.source_approval_id
      : transfer.target_approval_id;
    if (!approvalId) {
      throw new ConflictException('No approval is assigned to this boundary');
    }
    await this.approvalService.decideApproval(
      approvalId,
      actorId,
      dto.decision,
      dto.reason,
    );

    const approvalIds = [
      transfer.source_approval_id,
      transfer.target_approval_id,
    ].filter((id): id is string => Boolean(id));
    const approvals = await this.prisma.commercialApproval.findMany({
      where: { id: { in: approvalIds } },
      select: { status: true },
    });
    const status = approvals.some((approval) => approval.status === 'REJECTED')
      ? 'REJECTED'
      : approvals.length === approvalIds.length &&
          approvals.every((approval) => approval.status === 'APPROVED')
        ? 'APPROVED'
        : 'PENDING_APPROVAL';
    const updated = await this.prisma.corporateTransfer.update({
      where: { id: transfer.id },
      data: { status },
    });
    await this.prisma.commercialEvent.create({
      data: {
        event_type: 'corporate_transfer.decision_recorded',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `corporate-transfer-${transfer.id}-${approvalId}-${dto.decision.toLowerCase()}`,
        payload: JSON.stringify({
          transferId: transfer.id,
          approvalId,
          decision: dto.decision,
          aggregateStatus: status,
        }),
      },
    });
    return this.view(updated);
  }

  async executeTransfer(
    transferId: string,
    sourceTenantId: string,
    sourceEnvironmentId: string | null,
    actorId: string,
  ) {
    const environment = this.requireEnvironment(sourceEnvironmentId);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.corporateTransfer.findFirst({
        where: {
          id: transferId,
          source_tenant_id: sourceTenantId,
          source_environment_id: environment,
        },
      });
      if (!transfer) {
        throw new NotFoundException(
          `Corporate transfer '${transferId}' not found`,
        );
      }
      if (transfer.status !== 'APPROVED') {
        throw new ConflictException(
          `Corporate transfer '${transferId}' is '${transfer.status}', not APPROVED`,
        );
      }
      if (transfer.effective_at > new Date()) {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSFER_EFFECTIVE_BOUNDARY_NOT_REACHED',
          message: `Transfer cannot execute before ${transfer.effective_at.toISOString()}`,
        });
      }

      const [sourceBinding, targetAccount, holds, evidenceCount, lineageCount] =
        await Promise.all([
          tx.commercialAccountTenantBinding.findFirst({
            where: {
              id: transfer.source_binding_id,
              commercial_account_id: transfer.source_commercial_account_id,
              tenant_id: sourceTenantId,
              environment_id: environment,
              status: 'ACTIVE',
            },
          }),
          tx.commercialAccount.findFirst({
            where: {
              id: transfer.target_commercial_account_id,
              status: 'ACTIVE',
            },
            select: { id: true },
          }),
          tx.legalHold.findMany({
            where: { tenant_id: sourceTenantId, status: 'ACTIVE' },
            select: { id: true },
          }),
          tx.evidenceRecord.count({ where: { tenant_id: sourceTenantId } }),
          tx.evidenceLineage.count({ where: { tenant_id: sourceTenantId } }),
        ]);
      if (!sourceBinding) {
        throw new ConflictException('The source binding is no longer active');
      }
      if (!targetAccount) {
        throw new ConflictException(
          'The approved target commercial account is no longer active',
        );
      }
      if (
        sourceBinding.updated_at.toISOString() !==
        transfer.source_binding_updated_at.toISOString()
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSFER_SOURCE_CHANGED',
          message:
            'The source binding changed after approval; request a new transfer plan',
        });
      }
      if (
        holds.length &&
        transfer.legal_hold_decision !== 'PRESERVE_IN_SOURCE'
      ) {
        throw new ConflictException(
          'An active legal hold blocks this transfer execution decision',
        );
      }
      if (transfer.export_decision === 'REQUIRED_BEFORE_EXECUTION') {
        const manifest = transfer.export_manifest_id
          ? await tx.exportManifest.findFirst({
              where: {
                id: transfer.export_manifest_id,
                tenant_id: sourceTenantId,
                completeness_state: 'COMPLETE',
              },
              select: { id: true },
            })
          : null;
        if (!manifest) {
          throw new ConflictException(
            'The approved complete export prerequisite is unavailable',
          );
        }
      }

      const close = await tx.commercialAccountTenantBinding.updateMany({
        where: {
          id: sourceBinding.id,
          status: 'ACTIVE',
          updated_at: sourceBinding.updated_at,
        },
        data: {
          status: 'ENDED',
          effective_to: transfer.effective_at,
        },
      });
      if (close.count !== 1) {
        throw new ConflictException(
          'The source binding changed during execution',
        );
      }

      const existingTarget = await tx.commercialAccountTenantBinding.findUnique(
        {
          where: {
            commercial_account_id_tenant_id_environment_id: {
              commercial_account_id: transfer.target_commercial_account_id,
              tenant_id: transfer.target_tenant_id,
              environment_id: transfer.target_environment_id,
            },
          },
        },
      );
      if (existingTarget && existingTarget.status !== 'ACTIVE') {
        throw new ConflictException(
          'The target boundary exists but is not ACTIVE',
        );
      }
      if (
        existingTarget &&
        (existingTarget.legal_entity_id !== transfer.target_legal_entity_id ||
          existingTarget.business_unit_id !==
            transfer.target_business_unit_id ||
          existingTarget.region !== transfer.target_region ||
          existingTarget.residency_policy !==
            transfer.target_residency_policy ||
          !this.sameStringSet(
            this.parseArray(existingTarget.service_scope),
            this.parseArray(transfer.target_service_scope),
          ))
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSFER_TARGET_CHANGED',
          message:
            'The existing target binding does not match the approved transfer plan',
        });
      }
      const targetBinding =
        existingTarget ||
        (await tx.commercialAccountTenantBinding.create({
          data: {
            commercial_account_id: transfer.target_commercial_account_id,
            tenant_id: transfer.target_tenant_id,
            legal_entity_id: transfer.target_legal_entity_id,
            business_unit_id: transfer.target_business_unit_id,
            environment_id: transfer.target_environment_id,
            region: transfer.target_region,
            residency_policy: transfer.target_residency_policy,
            service_scope: transfer.target_service_scope,
            relationship_type: 'TRANSFER_TARGET',
            is_primary: true,
            status: 'ACTIVE',
            effective_from: transfer.effective_at,
          },
        }));

      const mappings = this.parseMappings(transfer.entitlement_mapping);
      const targetEntitlementIds: string[] = [];
      for (const mapping of mappings) {
        const sourceEntitlement = await tx.entitlement.findFirst({
          where: {
            id: mapping.sourceEntitlementId,
            commercial_account_id: transfer.source_commercial_account_id,
            tenant_id: sourceTenantId,
            status: 'ACTIVE',
          },
        });
        if (!sourceEntitlement) {
          throw new ConflictException(
            `Mapped source entitlement '${mapping.sourceEntitlementId}' is no longer active`,
          );
        }
        const expired = await tx.entitlement.updateMany({
          where: { id: sourceEntitlement.id, status: 'ACTIVE' },
          data: {
            status: 'TRANSFERRED',
            effective_to: transfer.effective_at,
          },
        });
        if (expired.count !== 1) {
          throw new ConflictException(
            `Source entitlement '${sourceEntitlement.id}' changed during execution`,
          );
        }
        const targetEntitlement = await tx.entitlement.create({
          data: {
            commercial_account_id: transfer.target_commercial_account_id,
            tenant_id: transfer.target_tenant_id,
            offer_type: mapping.targetOfferType,
            status: 'ACTIVE',
            effective_from: transfer.effective_at,
          },
        });
        targetEntitlementIds.push(targetEntitlement.id);
      }

      const evidenceSnapshot = {
        sourceTenantId,
        sourceEnvironmentId: environment,
        evidenceRecordCount: evidenceCount,
        evidenceLineageCount: lineageCount,
        capturedAt: new Date().toISOString(),
        policy: 'PRESERVE_SOURCE_IDENTIFIERS',
      };
      const executed = await tx.corporateTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'RECONCILIATION_PENDING',
          executed_by: actorId,
          executed_at: new Date(),
          legal_hold_references: JSON.stringify(holds.map((hold) => hold.id)),
          evidence_boundary_snapshot: JSON.stringify(evidenceSnapshot),
          reconciliation_result: JSON.stringify({ targetEntitlementIds }),
        },
      });
      await tx.commercialApproval.updateMany({
        where: {
          id: {
            in: [
              transfer.source_approval_id,
              transfer.target_approval_id,
            ].filter((id): id is string => Boolean(id)),
          },
          status: 'APPROVED',
        },
        data: { status: 'APPLIED', applied_at: new Date() },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'corporate_transfer.executed',
          tenant_id: sourceTenantId,
          actor: actorId,
          idempotency_key: `corporate-transfer-executed-${transfer.id}`,
          payload: JSON.stringify({
            transferId: transfer.id,
            sourceBindingId: sourceBinding.id,
            targetBindingId: targetBinding.id,
            targetEntitlementIds,
            evidenceBoundarySnapshot: evidenceSnapshot,
            historicalEvidenceReassigned: false,
          }),
        },
      });
      return this.view(executed);
    });
  }

  async reconcileTransfer(
    transferId: string,
    targetTenantId: string,
    targetEnvironmentId: string | null,
    actorId: string,
    dto: ReconcileCorporateTransferDto,
  ) {
    const environment = this.requireEnvironment(targetEnvironmentId);
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.corporateTransfer.findFirst({
        where: {
          id: transferId,
          target_tenant_id: targetTenantId,
          target_environment_id: environment,
        },
      });
      if (!transfer) {
        throw new NotFoundException(
          `Corporate transfer '${transferId}' not found`,
        );
      }
      if (transfer.status !== 'RECONCILIATION_PENDING') {
        throw new ConflictException(
          `Corporate transfer '${transferId}' is '${transfer.status}', not RECONCILIATION_PENDING`,
        );
      }
      const targetBinding = await tx.commercialAccountTenantBinding.findUnique({
        where: {
          commercial_account_id_tenant_id_environment_id: {
            commercial_account_id: transfer.target_commercial_account_id,
            tenant_id: targetTenantId,
            environment_id: environment,
          },
        },
        select: { id: true, status: true },
      });
      const previousResult = this.parseObject(transfer.reconciliation_result);
      const targetEntitlementIds = Array.isArray(
        previousResult.targetEntitlementIds,
      )
        ? previousResult.targetEntitlementIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [];
      const targetEntitlementCount = await tx.entitlement.count({
        where: {
          id: { in: targetEntitlementIds },
          commercial_account_id: transfer.target_commercial_account_id,
          tenant_id: targetTenantId,
          status: 'ACTIVE',
        },
      });
      if (
        !targetBinding ||
        targetBinding.status !== 'ACTIVE' ||
        targetEntitlementCount !== targetEntitlementIds.length
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'TRANSFER_RECONCILIATION_FAILED',
          message:
            'Target binding or mapped target entitlements are not active',
        });
      }
      const result = {
        outcome: dto.outcome,
        notes: dto.notes,
        targetBindingId: targetBinding.id,
        targetEntitlementIds,
        evidenceLineagePolicy: transfer.evidence_lineage_policy,
        evidenceBoundarySnapshot: this.parseObject(
          transfer.evidence_boundary_snapshot,
        ),
      };
      const reconciled = await tx.corporateTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'RECONCILED',
          reconciled_by: actorId,
          reconciled_at: new Date(),
          reconciliation_result: JSON.stringify(result),
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'corporate_transfer.reconciled',
          tenant_id: targetTenantId,
          actor: actorId,
          idempotency_key: `corporate-transfer-reconciled-${transfer.id}`,
          payload: JSON.stringify({ transferId: transfer.id, ...result }),
        },
      });
      return this.view(reconciled);
    });
  }

  private async getParticipant(
    transferId: string,
    tenantId: string,
    environmentId: string | null,
  ) {
    const environment = this.requireEnvironment(environmentId);
    const transfer = await this.prisma.corporateTransfer.findFirst({
      where: {
        id: transferId,
        OR: [
          {
            source_tenant_id: tenantId,
            source_environment_id: environment,
          },
          {
            target_tenant_id: tenantId,
            target_environment_id: environment,
          },
        ],
      },
    });
    if (!transfer) {
      throw new NotFoundException(
        `Corporate transfer '${transferId}' not found`,
      );
    }
    return transfer;
  }

  private requireEnvironment(environmentId: string | null) {
    if (!environmentId) {
      throw new BadRequestException(
        'An environment-bound session is required for a corporate transfer',
      );
    }
    return environmentId;
  }

  private assertUniqueMappings(mappings: TransferEntitlementMappingDto[]) {
    const ids = mappings.map((mapping) => mapping.sourceEntitlementId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Each source entitlement may appear only once in the transfer mapping',
      );
    }
  }

  private planSnapshot(transfer: Record<string, unknown>) {
    return {
      transferId: transfer.id,
      sourceCommercialAccountId: transfer.source_commercial_account_id,
      sourceTenantId: transfer.source_tenant_id,
      sourceEnvironmentId: transfer.source_environment_id,
      targetCommercialAccountId: transfer.target_commercial_account_id,
      targetTenantId: transfer.target_tenant_id,
      targetEnvironmentId: transfer.target_environment_id,
      effectiveAt:
        transfer.effective_at instanceof Date
          ? transfer.effective_at.toISOString()
          : transfer.effective_at,
      dataDecision: transfer.data_decision,
      exportDecision: transfer.export_decision,
      exportManifestId: transfer.export_manifest_id,
      legalHoldDecision: transfer.legal_hold_decision,
      entitlementMapping: this.parseMappings(transfer.entitlement_mapping),
      evidenceLineagePolicy: transfer.evidence_lineage_policy,
    };
  }

  private view<T extends Record<string, any>>(transfer: T) {
    return {
      ...transfer,
      target_service_scope: this.parseArray(transfer.target_service_scope),
      legal_hold_references: this.parseArray(transfer.legal_hold_references),
      entitlement_mapping: this.parseMappings(transfer.entitlement_mapping),
      evidence_boundary_snapshot: this.parseObject(
        transfer.evidence_boundary_snapshot,
      ),
      reconciliation_result: this.parseObject(transfer.reconciliation_result),
    };
  }

  private parseMappings(value: unknown): TransferEntitlementMappingDto[] {
    return this.parseArray(value).filter(
      (item): item is TransferEntitlementMappingDto =>
        Boolean(
          item &&
          typeof item === 'object' &&
          typeof (item as any).sourceEntitlementId === 'string' &&
          typeof (item as any).targetOfferType === 'string',
        ),
    );
  }

  private parseArray(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseObject(value: unknown): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  private sameStringSet(left: unknown[], right: unknown[]) {
    const normalize = (values: unknown[]) =>
      values
        .filter((value): value is string => typeof value === 'string')
        .sort();
    return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
  }
}
