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
  IsString,
  IsUUID,
  Min,
  isUUID as isUuidValue,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const NO_GUARANTEE_WORDING =
  'Platform support does not constitute certification, regulatory approval, legal advice, or a guarantee of compliance.';

export class CreateContinuousAssuranceProfileDto {
  @IsString()
  profileKey!: string;

  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  contractId!: string;

  @IsString()
  serviceTier!: string;

  @IsIn([
    'LEGAL_ENTITY_FRAMEWORK_TIER',
    'COMMITTED_ASSURANCE_SCOPE',
    'AUDITOR_WORKSPACE_TIER',
  ])
  recurringPricingMetric!: string;

  @IsUUID()
  priceBookId!: string;

  @IsArray()
  @IsString({ each: true })
  legalEntityIds!: string[];

  @IsArray()
  @IsString({ each: true })
  businessUnitIds!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  frameworkVersionIds!: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  sectorPackIds?: string[];

  @IsArray()
  @IsUUID('4', { each: true })
  connectorIds!: string[];

  @IsObject()
  controlScope!: Record<string, unknown>;

  @IsObject()
  evidenceRetentionPolicy!: Record<string, unknown>;

  @IsInt()
  @Min(0)
  auditorSeats!: number;

  @IsInt()
  @Min(0)
  workspaceCount!: number;

  @IsString()
  region!: string;

  @IsString()
  deploymentClass!: string;

  @IsObject()
  humanObligations!: Record<string, unknown>;

  @IsISO8601()
  effectiveFrom!: Date;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: Date;

  @IsString()
  reason!: string;
}

export class DecideContinuousAssuranceProfileDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

/** Contract-specific F commercial scope with outcome-neutral pricing. */
@Injectable()
export class ContinuousAssuranceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private nonEmpty(values: string[], field: string) {
    const normalized = [...new Set(values.map((value) => value.trim()))].filter(
      Boolean,
    );
    if (normalized.length !== values.length) {
      throw new BadRequestException(
        `${field} contains empty or duplicate values`,
      );
    }
    return normalized;
  }

  private required(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized)
      throw new BadRequestException(`${field} must be non-empty`);
    return normalized;
  }

  private async requireProfile(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const profile = await this.prisma.continuousAssuranceProfile.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Continuous Assurance profile '${id}' not found`,
      );
    }
    return profile;
  }

  listProfiles(tenantId: string, environmentId: string) {
    return this.prisma.continuousAssuranceProfile.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
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
    dto: CreateContinuousAssuranceProfileDto,
  ) {
    const profileKey = this.required(dto.profileKey, 'profileKey');
    const serviceTier = this.required(dto.serviceTier, 'serviceTier');
    const reason = this.required(dto.reason, 'reason');
    const region = this.required(dto.region, 'region');
    const deploymentClass = this.required(
      dto.deploymentClass,
      'deploymentClass',
    );
    if (
      ![
        'LEGAL_ENTITY_FRAMEWORK_TIER',
        'COMMITTED_ASSURANCE_SCOPE',
        'AUDITOR_WORKSPACE_TIER',
      ].includes(dto.recurringPricingMetric)
    ) {
      throw new BadRequestException(
        'Pricing cannot use control failures, exceptions, findings, or audit outcomes',
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
    const legalEntityIds = this.nonEmpty(dto.legalEntityIds, 'legalEntityIds');
    const businessUnitIds = this.nonEmpty(
      dto.businessUnitIds,
      'businessUnitIds',
    );
    if (!legalEntityIds.length && !businessUnitIds.length) {
      throw new BadRequestException(
        'At least one legal entity or business unit must define commercial scope',
      );
    }
    const frameworkVersionIds = [...new Set(dto.frameworkVersionIds)];
    const sectorPackIds = [...new Set(dto.sectorPackIds ?? [])];
    const connectorIds = [...new Set(dto.connectorIds)];
    const allContractedControls =
      dto.controlScope.allContractedControls === true;
    const rawControlImplementationIds =
      dto.controlScope.controlImplementationIds;
    const controlImplementationIds = Array.isArray(rawControlImplementationIds)
      ? [...new Set(rawControlImplementationIds)]
      : [];
    if (
      (allContractedControls && controlImplementationIds.length > 0) ||
      (!allContractedControls && controlImplementationIds.length === 0) ||
      controlImplementationIds.some(
        (id) => typeof id !== 'string' || !isUuidValue(id),
      ) ||
      dto.auditorSeats < 0 ||
      dto.workspaceCount < 0
    ) {
      throw new BadRequestException(
        'Control scope must select allContractedControls or unique controlImplementationIds, and seat/workspace quantities cannot be negative',
      );
    }
    const retention = dto.evidenceRetentionPolicy;
    if (
      retention.customerVisible !== true ||
      typeof retention.profileRef !== 'string' ||
      !retention.profileRef.trim() ||
      typeof retention.historicalTreatment !== 'string' ||
      retention.historicalTreatment !== 'PRESERVE_BY_ORIGINAL_POLICY'
    ) {
      throw new BadRequestException(
        'Evidence retention must be customer-visible and preserve historical evidence by its original policy',
      );
    }
    const obligationKeys = [
      'onboarding',
      'mappingReview',
      'evidenceQualityReview',
      'assessmentCycles',
      'auditPackageProduction',
      'advisorySupport',
    ];
    if (
      obligationKeys.some((key) => {
        const value = dto.humanObligations[key];
        return (
          !value ||
          typeof value !== 'object' ||
          typeof (value as Record<string, unknown>).purchased !== 'boolean'
        );
      })
    ) {
      throw new BadRequestException(
        'Every human obligation must explicitly state whether it was purchased',
      );
    }

    const [
      contract,
      binding,
      price,
      entitlement,
      frameworks,
      packs,
      connectors,
      controlImplementations,
    ] = await Promise.all([
      this.prisma.contract.findUnique({ where: { id: dto.contractId } }),
      this.prisma.commercialAccountTenantBinding.findFirst({
        where: {
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          environment_id: environmentId,
          region,
          status: 'ACTIVE',
          effective_from: { lte: effectiveFrom },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveTo ?? effectiveFrom } },
          ],
        },
      }),
      this.prisma.priceBook.findUnique({ where: { id: dto.priceBookId } }),
      this.prisma.entitlement.findFirst({
        where: {
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          offer_type: 'CONTINUOUS_ASSURANCE',
          status: 'ACTIVE',
          effective_from: { lte: effectiveFrom },
          OR: [
            { effective_to: null },
            { effective_to: { gte: effectiveTo ?? effectiveFrom } },
          ],
        },
      }),
      this.prisma.frameworkVersion.findMany({
        where: {
          id: { in: frameworkVersionIds },
          status: 'PUBLISHED',
          release_status: 'APPROVED',
          content_license_status: 'LICENSED',
          display_rights: true,
          mapping_test_status: 'PASSED',
        },
      }),
      this.prisma.sectorPack.findMany({
        where: {
          id: { in: sectorPackIds },
          release_status: 'APPROVED',
          content_license_status: 'LICENSED',
          display_rights: true,
          mapping_test_status: 'PASSED',
          marketAvailability: { some: { region, available: true } },
        },
      }),
      this.prisma.connectorInstance.findMany({
        where: {
          id: { in: connectorIds },
          tenant_id: tenantId,
          environment_id: environmentId,
          state: { in: ['CONNECTED', 'SYNCING', 'HEALTHY'] },
          deletedAt: null,
        },
      }),
      this.prisma.controlImplementation.findMany({
        where: {
          tenant_id: tenantId,
          OR: [{ environment_id: null }, { environment_id: environmentId }],
          ...(allContractedControls
            ? {}
            : { id: { in: controlImplementationIds as string[] } }),
          scopes: {
            some: {
              tenant_id: tenantId,
              AND: [
                {
                  OR: [
                    { environment_id: null },
                    { environment_id: environmentId },
                  ],
                },
                {
                  OR: [
                    ...(legalEntityIds.length
                      ? [{ legal_entity_id: { in: legalEntityIds } }]
                      : []),
                    ...(businessUnitIds.length
                      ? [{ business_unit_id: { in: businessUnitIds } }]
                      : []),
                  ],
                },
              ],
            },
          },
        },
        select: { id: true },
      }),
    ]);
    if (
      !contract ||
      contract.status !== 'ACTIVE' ||
      contract.commercial_account_id !== dto.commercialAccountId
    ) {
      throw new ConflictException(
        'Continuous Assurance requires the matching ACTIVE contract',
      );
    }
    if (!binding || !entitlement) {
      throw new ConflictException(
        'Continuous Assurance requires an active account binding and entitlement for this tenant environment and region',
      );
    }
    if (
      effectiveFrom < contract.term_start ||
      (effectiveTo ?? contract.term_end) > contract.term_end
    ) {
      throw new ConflictException(
        'Continuous Assurance dates must fit inside the contract term',
      );
    }
    if (
      !price ||
      price.status !== 'APPROVED' ||
      price.catalog_version_id !== contract.catalog_version_id ||
      (price.commercial_account_id &&
        price.commercial_account_id !== dto.commercialAccountId) ||
      !['GLOBAL', region].includes(price.region) ||
      price.effective_from > effectiveFrom ||
      (price.effective_to &&
        (effectiveTo ?? contract.term_end) > price.effective_to)
    ) {
      throw new ConflictException(
        'priceBookId must be an approved account, catalog, region and term-compatible price',
      );
    }
    if (frameworks.length !== frameworkVersionIds.length) {
      throw new ConflictException(
        'Every framework version must be fully released with content rights, review, mapping tests and wording',
      );
    }
    if (packs.length !== sectorPackIds.length) {
      throw new ConflictException(
        'Every sector pack must be released and explicitly available in the contracted region',
      );
    }
    if (connectors.length !== connectorIds.length) {
      throw new ConflictException(
        'Every connector must be active in the contracted tenant environment',
      );
    }
    if (
      controlImplementations.length === 0 ||
      (!allContractedControls &&
        controlImplementations.length !== controlImplementationIds.length)
    ) {
      throw new ConflictException(
        'Every selected control implementation must belong to the contracted tenant, environment, legal-entity or business-unit scope',
      );
    }
    const incompleteFramework = frameworks.some(
      (framework) =>
        !framework.source_reference?.trim() ||
        !framework.source_version?.trim() ||
        !framework.license_reference?.trim() ||
        !framework.legal_interpretation_ref?.trim() ||
        !framework.sme_review_ref?.trim() ||
        !framework.mapping_test_report_ref?.trim() ||
        !framework.approved_claim_wording?.trim(),
    );
    const incompletePack = packs.some(
      (pack) =>
        !pack.source_reference?.trim() ||
        !pack.source_version?.trim() ||
        !pack.license_reference?.trim() ||
        !pack.legal_interpretation_ref?.trim() ||
        !pack.sme_review_ref?.trim() ||
        !pack.mapping_test_report_ref?.trim() ||
        !pack.approved_claim_wording?.trim(),
    );
    if (incompleteFramework || incompletePack) {
      throw new ConflictException(
        'Assurance content release evidence is incomplete',
      );
    }
    const overlapping = await this.prisma.continuousAssuranceProfile.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        contract_id: contract.id,
        status: { in: ['PENDING_APPROVAL', 'ACTIVE'] },
        effective_from: { lt: effectiveTo ?? contract.term_end },
        OR: [{ effective_to: null }, { effective_to: { gt: effectiveFrom } }],
      },
    });
    if (overlapping) {
      throw new ConflictException(
        `Continuous Assurance profile '${overlapping.id}' already covers this contract window`,
      );
    }
    const latest = await this.prisma.continuousAssuranceProfile.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        profile_key: profileKey,
      },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.continuousAssuranceProfile.create({
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
          legal_entity_ids: JSON.stringify(legalEntityIds),
          business_unit_ids: JSON.stringify(businessUnitIds),
          framework_version_ids: JSON.stringify(frameworkVersionIds),
          sector_pack_ids: JSON.stringify(sectorPackIds),
          connector_ids: JSON.stringify(connectorIds),
          control_scope: JSON.stringify(dto.controlScope),
          evidence_retention_policy: JSON.stringify(retention),
          auditor_seats: dto.auditorSeats,
          workspace_count: dto.workspaceCount,
          region,
          deployment_class: deploymentClass,
          human_obligations: JSON.stringify(dto.humanObligations),
          no_guarantee_wording: NO_GUARANTEE_WORDING,
          effective_from: effectiveFrom,
          effective_to: effectiveTo,
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'CONTINUOUS_ASSURANCE_PROFILE',
          objectType: 'ContinuousAssuranceProfile',
          objectId: profile.id,
          tenantId,
          requestedBy,
          reason,
          proposedSnapshot: {
            ...dto,
            profileKey,
            serviceTier,
            version,
            legalEntityIds,
            businessUnitIds,
            frameworkVersionIds,
            sectorPackIds,
            connectorIds,
            noGuaranteeWording: NO_GUARANTEE_WORDING,
          },
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
          expiresAt: effectiveTo,
        },
        tx,
      );
      return tx.continuousAssuranceProfile.update({
        where: { id: profile.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async decideProfile(
    id: string,
    tenantId: string,
    environmentId: string,
    approvedBy: string,
    dto: DecideContinuousAssuranceProfileDto,
  ) {
    const profile = await this.requireProfile(id, tenantId, environmentId);
    if (profile.status !== 'PENDING_APPROVAL' || !profile.approval_id) {
      throw new ConflictException(
        `Continuous Assurance profile '${id}' has no pending approval`,
      );
    }
    await this.approvals.decideApproval(
      profile.approval_id,
      approvedBy,
      dto.decision,
      dto.reason,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.continuousAssuranceProfile.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'ACTIVE',
                approved_by: approvedBy,
                approved_at: new Date(),
                activated_at: new Date(),
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
}
