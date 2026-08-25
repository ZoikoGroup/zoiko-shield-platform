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
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const NO_LEGAL_CONCLUSION_WORDING =
  'Incident Response service does not establish legal privilege or provide breach-notification, regulatory, or legal conclusions unless a separately contracted service is controlled by qualified counsel.';

export class CreateIncidentResponseRetainerDto {
  @IsString()
  retainerKey!: string;

  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  contractId!: string;

  @IsUUID()
  serviceObligationId!: string;

  @IsUUID()
  priceBookId!: string;

  @IsISO8601()
  termStart!: Date;

  @IsISO8601()
  termEnd!: Date;

  @IsNumber()
  @IsPositive()
  includedHours!: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  includedServices!: string[];

  @IsObject()
  responseWindow!: Record<string, unknown>;

  @IsObject()
  readinessObligations!: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  exclusions!: string[];

  @IsIn(['R0', 'R1', 'R2', 'R3', 'R4'])
  maximumResponseAuthority!: string;

  @IsIn(['BLOCK', 'REQUIRE_APPROVAL', 'ALLOW_CAPPED'])
  overagePolicy!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  overageCapHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overageRate?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  warningThresholdPercent!: number;

  @IsIn(['NONE', 'CAPPED', 'FULL'])
  rolloverPolicy!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  rolloverCapHours?: number;

  @IsObject()
  namedActivationPath!: Record<string, unknown>;

  @IsObject()
  emergencyProvision!: Record<string, unknown>;

  @IsObject()
  thirdPartyCostPolicy!: Record<string, unknown>;

  @IsObject()
  legalServiceScope!: Record<string, unknown>;

  @IsString()
  reason!: string;
}

export class DecideIncidentResponseRetainerDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

/** G retainer authority: exact annual scope, service readiness and economics. */
@Injectable()
export class IncidentResponseRetainerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private required(value: string, field: string) {
    const normalized = value.trim();
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

  private requireObjectString(
    value: Record<string, unknown>,
    key: string,
    objectName: string,
  ) {
    const candidate = value[key];
    if (typeof candidate !== 'string' || !candidate.trim()) {
      throw new BadRequestException(
        `${objectName}.${key} must be a non-empty string`,
      );
    }
    return candidate.trim();
  }

  private validateOperatingScope(dto: CreateIncidentResponseRetainerDto) {
    const coverage = this.requireObjectString(
      dto.responseWindow,
      'coverage',
      'responseWindow',
    );
    if (!['BUSINESS_HOURS', 'EXTENDED', '24X7'].includes(coverage)) {
      throw new BadRequestException(
        'responseWindow.coverage must be BUSINESS_HOURS, EXTENDED, or 24X7',
      );
    }
    for (const key of [
      'acknowledgementTargetMinutes',
      'activationResponseMinutes',
    ]) {
      const value = dto.responseWindow[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new BadRequestException(
          `responseWindow.${key} must be a positive number`,
        );
      }
    }
    for (const key of [
      'namedContacts',
      'accessProvisioning',
      'evidencePreservation',
      'escalationPath',
    ]) {
      const value = dto.readinessObligations[key];
      if (
        !value ||
        typeof value !== 'object' ||
        typeof (value as Record<string, unknown>).required !== 'boolean'
      ) {
        throw new BadRequestException(
          `readinessObligations.${key}.required must be explicit`,
        );
      }
    }
    for (const key of ['role', 'contactReference', 'method']) {
      this.requireObjectString(
        dto.namedActivationPath,
        key,
        'namedActivationPath',
      );
    }
    if (
      dto.overagePolicy === 'ALLOW_CAPPED' &&
      (!dto.overageCapHours || dto.overageCapHours <= 0)
    ) {
      throw new BadRequestException(
        'ALLOW_CAPPED requires a positive overageCapHours',
      );
    }
    if (
      dto.overagePolicy === 'BLOCK' &&
      (dto.overageCapHours !== undefined || (dto.overageRate ?? 0) !== 0)
    ) {
      throw new BadRequestException(
        'BLOCK cannot define an overage cap or rate',
      );
    }
    if (
      dto.rolloverPolicy === 'CAPPED' &&
      (!dto.rolloverCapHours || dto.rolloverCapHours <= 0)
    ) {
      throw new BadRequestException(
        'CAPPED rollover requires positive rolloverCapHours',
      );
    }
    if (dto.rolloverPolicy === 'NONE' && dto.rolloverCapHours !== undefined) {
      throw new BadRequestException(
        'NONE rollover cannot define rolloverCapHours',
      );
    }
    const emergencyEnabled = dto.emergencyProvision.enabled === true;
    if (
      typeof dto.emergencyProvision.enabled !== 'boolean' ||
      dto.emergencyProvision.reconciliationRequired !== true ||
      (emergencyEnabled &&
        !this.requireObjectString(
          dto.emergencyProvision,
          'contractReference',
          'emergencyProvision',
        ))
    ) {
      throw new BadRequestException(
        'Emergency provision must explicitly state enabled and always require reconciliation',
      );
    }
    const thirdPartyEnabled = dto.thirdPartyCostPolicy.enabled === true;
    if (typeof dto.thirdPartyCostPolicy.enabled !== 'boolean') {
      throw new BadRequestException(
        'thirdPartyCostPolicy.enabled must be explicit',
      );
    }
    if (thirdPartyEnabled) {
      this.requireObjectString(
        dto.thirdPartyCostPolicy,
        'contractReference',
        'thirdPartyCostPolicy',
      );
      const markup = dto.thirdPartyCostPolicy.maxMarkupPercent;
      if (
        typeof markup !== 'number' ||
        !Number.isFinite(markup) ||
        markup < 0 ||
        markup > 100 ||
        dto.thirdPartyCostPolicy.requiresNamedApproval !== true
      ) {
        throw new BadRequestException(
          'Enabled third-party costs require a bounded markup and named approval',
        );
      }
    }
    if (typeof dto.legalServiceScope.included !== 'boolean') {
      throw new BadRequestException(
        'legalServiceScope.included must be explicit',
      );
    }
    if (dto.legalServiceScope.included === true) {
      if (
        dto.legalServiceScope.counselControlled !== true ||
        !this.requireObjectString(
          dto.legalServiceScope,
          'contractReference',
          'legalServiceScope',
        )
      ) {
        throw new BadRequestException(
          'Included legal services require separate contract reference and counsel control',
        );
      }
    } else if (dto.legalServiceScope.counselControlled !== false) {
      throw new BadRequestException(
        'Excluded legal services must explicitly set counselControlled to false',
      );
    }
  }

  private async requireRetainer(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const retainer = await this.prisma.incidentResponseRetainer.findFirst({
      where: { id, tenant_id: tenantId, environment_id: environmentId },
    });
    if (!retainer) {
      throw new NotFoundException(
        `Incident Response retainer '${id}' not found`,
      );
    }
    return retainer;
  }

  list(tenantId: string, environmentId: string) {
    return this.prisma.incidentResponseRetainer.findMany({
      where: { tenant_id: tenantId, environment_id: environmentId },
      orderBy: [{ retainer_key: 'asc' }, { version: 'desc' }],
    });
  }

  get(id: string, tenantId: string, environmentId: string) {
    return this.requireRetainer(id, tenantId, environmentId);
  }

  async create(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateIncidentResponseRetainerDto,
  ) {
    const retainerKey = this.required(dto.retainerKey, 'retainerKey');
    const reason = this.required(dto.reason, 'reason');
    const includedServices = this.uniqueStrings(
      dto.includedServices,
      'includedServices',
    );
    const exclusions = dto.exclusions.length
      ? this.uniqueStrings(dto.exclusions, 'exclusions')
      : [];
    this.validateOperatingScope(dto);
    const termStart = new Date(dto.termStart);
    const termEnd = new Date(dto.termEnd);
    const termDays =
      (termEnd.getTime() - termStart.getTime()) / (24 * 60 * 60 * 1000);
    if (
      Number.isNaN(termDays) ||
      termEnd <= termStart ||
      termDays < 300 ||
      termDays > 370
    ) {
      throw new BadRequestException(
        'Incident Response retainer term must be an annual term between 300 and 370 days',
      );
    }
    const [contract, obligation, binding, price] = await Promise.all([
      this.prisma.contract.findUnique({ where: { id: dto.contractId } }),
      this.prisma.serviceObligation.findFirst({
        where: {
          id: dto.serviceObligationId,
          tenant_id: tenantId,
          environment_id: environmentId,
          contract_id: dto.contractId,
          obligation_type: 'IR_RETAINER',
          status: 'ACTIVE',
        },
      }),
      this.prisma.commercialAccountTenantBinding.findFirst({
        where: {
          commercial_account_id: dto.commercialAccountId,
          tenant_id: tenantId,
          environment_id: environmentId,
          status: 'ACTIVE',
          effective_from: { lte: termStart },
          OR: [{ effective_to: null }, { effective_to: { gte: termEnd } }],
        },
      }),
      this.prisma.priceBook.findUnique({ where: { id: dto.priceBookId } }),
    ]);
    if (
      !contract ||
      contract.status !== 'ACTIVE' ||
      contract.commercial_account_id !== dto.commercialAccountId ||
      termStart < contract.term_start ||
      termEnd > contract.term_end
    ) {
      throw new ConflictException(
        'Retainer requires the matching ACTIVE contract and an annual term inside its term',
      );
    }
    if (!obligation || !binding) {
      throw new ConflictException(
        'Retainer requires an ACTIVE tenant-bound IR_RETAINER obligation and account binding',
      );
    }
    if (
      !price ||
      price.status !== 'APPROVED' ||
      price.catalog_version_id !== contract.catalog_version_id ||
      (price.commercial_account_id &&
        price.commercial_account_id !== dto.commercialAccountId) ||
      !['GLOBAL', binding.region].includes(price.region) ||
      price.effective_from > termStart ||
      (price.effective_to && price.effective_to < termEnd)
    ) {
      throw new ConflictException(
        'priceBookId must be an approved account, catalog, region and term-compatible price',
      );
    }
    const overlap = await this.prisma.incidentResponseRetainer.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        contract_id: contract.id,
        status: { in: ['PENDING_APPROVAL', 'ACTIVE'] },
        term_start: { lt: termEnd },
        term_end: { gt: termStart },
      },
    });
    if (overlap) {
      throw new ConflictException(
        `Incident Response retainer '${overlap.id}' already covers this contract window`,
      );
    }
    const latest = await this.prisma.incidentResponseRetainer.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        retainer_key: retainerKey,
      },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    return this.prisma.$transaction(async (tx) => {
      const retainer = await tx.incidentResponseRetainer.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          commercial_account_id: dto.commercialAccountId,
          contract_id: dto.contractId,
          service_obligation_id: dto.serviceObligationId,
          retainer_key: retainerKey,
          version,
          price_book_id: dto.priceBookId,
          term_start: termStart,
          term_end: termEnd,
          included_hours: dto.includedHours,
          included_services: JSON.stringify(includedServices),
          response_window: JSON.stringify(dto.responseWindow),
          readiness_obligations: JSON.stringify(dto.readinessObligations),
          exclusions: JSON.stringify(exclusions),
          maximum_response_authority: dto.maximumResponseAuthority,
          overage_policy: dto.overagePolicy,
          overage_cap_hours: dto.overageCapHours,
          overage_rate: dto.overageRate,
          warning_threshold_percent: dto.warningThresholdPercent,
          rollover_policy: dto.rolloverPolicy,
          rollover_cap_hours: dto.rolloverCapHours,
          named_activation_path: JSON.stringify(dto.namedActivationPath),
          emergency_provision: JSON.stringify(dto.emergencyProvision),
          third_party_cost_policy: JSON.stringify(dto.thirdPartyCostPolicy),
          legal_service_scope: JSON.stringify(dto.legalServiceScope),
          no_legal_conclusion_wording: NO_LEGAL_CONCLUSION_WORDING,
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'IR_RETAINER_PROFILE',
          objectType: 'IncidentResponseRetainer',
          objectId: retainer.id,
          tenantId,
          requestedBy,
          reason,
          proposedSnapshot: {
            ...dto,
            retainerKey,
            version,
            includedServices,
            exclusions,
            noLegalConclusionWording: NO_LEGAL_CONCLUSION_WORDING,
          },
          financialImpact:
            dto.includedHours * Number(price.unit_price) +
            (dto.overageCapHours ?? 0) * (dto.overageRate ?? 0),
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
        },
        tx,
      );
      return tx.incidentResponseRetainer.update({
        where: { id: retainer.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async decide(
    id: string,
    tenantId: string,
    environmentId: string,
    approvedBy: string,
    dto: DecideIncidentResponseRetainerDto,
  ) {
    const retainer = await this.requireRetainer(id, tenantId, environmentId);
    if (retainer.status !== 'PENDING_APPROVAL' || !retainer.approval_id) {
      throw new ConflictException(`Retainer '${id}' has no pending approval`);
    }
    await this.approvals.decideApproval(
      retainer.approval_id,
      approvedBy,
      dto.decision,
      this.required(dto.reason, 'reason'),
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.incidentResponseRetainer.update({
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
          where: { id: retainer.approval_id! },
          data: { status: 'APPLIED', applied_at: new Date() },
        });
      }
      return updated;
    });
  }
}
