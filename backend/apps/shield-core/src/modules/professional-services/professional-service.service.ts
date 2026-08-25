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

const SERVICE_TYPES = [
  'VCISO',
  'ASSESSMENT',
  'TABLETOP',
  'PENETRATION_TEST',
  'AUDIT_EVIDENCE_PROJECT',
  'GENERAL_PROFESSIONAL_SERVICE',
] as const;

type ServiceType = (typeof SERVICE_TYPES)[number];

const OBLIGATION_TYPE: Record<ServiceType, string> = {
  VCISO: 'VCISO',
  ASSESSMENT: 'ASSESSMENT_PROJECT',
  TABLETOP: 'TABLETOP_PROJECT',
  PENETRATION_TEST: 'PENETRATION_TEST',
  AUDIT_EVIDENCE_PROJECT: 'AUDIT_EVIDENCE_PROJECT',
  GENERAL_PROFESSIONAL_SERVICE: 'PROFESSIONAL_SERVICE',
};

export class CreateProfessionalServiceEngagementDto {
  @IsString()
  engagementKey!: string;

  @IsIn(SERVICE_TYPES)
  serviceType!: ServiceType;

  @IsUUID()
  commercialAccountId!: string;

  @IsUUID()
  contractId!: string;

  @IsUUID()
  serviceObligationId!: string;

  @IsUUID()
  priceBookId!: string;

  @IsString()
  sowReference!: string;

  @IsISO8601()
  termStart!: Date;

  @IsISO8601()
  termEnd!: Date;

  @IsOptional()
  @IsISO8601()
  scheduledServiceAt?: Date;

  @IsObject()
  scope!: Record<string, unknown>;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  requiredInputs!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  customerResponsibilities!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  providerResponsibilities!: string[];

  @IsArray()
  @ArrayNotEmpty()
  @IsObject({ each: true })
  deliverables!: Record<string, unknown>[];

  @IsArray()
  @ArrayNotEmpty()
  @IsObject({ each: true })
  acceptanceCriteria!: Record<string, unknown>[];

  @IsObject()
  correctionRetestPolicy!: Record<string, unknown>;

  @IsIn(['FIXED_FEE', 'HOUR_BANK', 'RETAINED', 'TIME_AND_MATERIALS'])
  pricingMode!: 'FIXED_FEE' | 'HOUR_BANK' | 'RETAINED' | 'TIME_AND_MATERIALS';

  @IsIn(['PROJECT', 'MONTHLY', 'QUARTERLY'])
  allocationPeriod!: 'PROJECT' | 'MONTHLY' | 'QUARTERLY';

  @IsNumber()
  @IsPositive()
  includedHours!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  warningThresholdPercent!: number;

  @IsIn(['BLOCK', 'REQUIRE_APPROVAL', 'ALLOW_CAPPED', 'TRACK_ONLY'])
  overagePolicy!: 'BLOCK' | 'REQUIRE_APPROVAL' | 'ALLOW_CAPPED' | 'TRACK_ONLY';

  @IsOptional()
  @IsNumber()
  @IsPositive()
  overageCapHours?: number;

  @IsIn(['NONE', 'CAPPED', 'FULL'])
  rolloverPolicy!: 'NONE' | 'CAPPED' | 'FULL';

  @IsOptional()
  @IsNumber()
  @IsPositive()
  rolloverCapHours?: number;

  @IsISO8601()
  hoursExpireAt!: Date;

  @IsOptional()
  @IsString()
  meetingCadence?: string;

  @IsOptional()
  @IsString()
  reviewCadence?: string;

  @IsOptional()
  @IsObject()
  penTestAuthorization?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  rulesOfEngagement?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  testerAssurance?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  reportTreatment?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  frameworkKey?: string;

  @IsOptional()
  @IsString()
  frameworkVersion?: string;

  @IsOptional()
  @IsObject()
  sourceDataResponsibilities?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  limitations!: string[];

  @IsString()
  reason!: string;
}

export class DecideProfessionalServiceProfileDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class ActivateProfessionalServiceDto {
  @IsString()
  activationReference!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  readinessEvidenceRefs!: string[];
}

export class LogProfessionalServiceActivityDto {
  @IsIn([
    'DELIVERY_WORK',
    'MEETING',
    'REVIEW',
    'WORKSHOP',
    'TEST_EXECUTION',
    'RETEST',
    'CORRECTION',
  ])
  activityType!: string;

  @IsNumber()
  @IsPositive()
  hours!: number;

  @IsString()
  summary!: string;

  @IsString()
  evidenceReference!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedRemainingHours?: number;

  @IsOptional()
  @IsISO8601()
  occurredAt?: Date;
}

export class RequestProfessionalServiceOverageDto {
  @IsNumber()
  @IsPositive()
  maxOverageHours!: number;

  @IsOptional()
  @IsISO8601()
  periodAt?: Date;

  @IsString()
  namedCustomerAuthorizer!: string;

  @IsString()
  customerApprovalReference!: string;

  @IsString()
  reason!: string;
}

export class SubmitProfessionalServiceDeliverableDto {
  @IsString()
  deliverableKey!: string;

  @IsString()
  title!: string;

  @IsString()
  contentReference!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  evidenceReferences!: string[];

  @IsArray()
  @IsString({ each: true })
  limitations!: string[];

  @IsOptional()
  @IsUUID()
  correctionOfId?: string;

  @IsOptional()
  @IsString()
  retestReference?: string;

  @IsOptional()
  @IsBoolean()
  submissionComplete?: boolean;
}

export class DecideProfessionalServiceAcceptanceDto {
  @IsIn(['ACCEPTED', 'CORRECTION_REQUIRED'])
  decision!: 'ACCEPTED' | 'CORRECTION_REQUIRED';

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  reviewedDeliverableIds!: string[];

  @IsObject()
  criteriaResults!: Record<string, unknown>;

  @IsString()
  namedCustomerAuthorizer!: string;

  @IsString()
  customerDecisionReference!: string;

  @IsOptional()
  @IsString()
  correctionScope?: string;

  @IsOptional()
  @IsBoolean()
  retestRequired?: boolean;
}

@Injectable()
export class ProfessionalServiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  private required(value: string | undefined, field: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException(`${field} must be non-empty`);
    }
    return normalized;
  }

  private uniqueStrings(values: string[], field: string, allowEmpty = false) {
    const normalized = [...new Set(values.map((value) => value.trim()))].filter(
      Boolean,
    );
    if (
      (!allowEmpty && !normalized.length) ||
      normalized.length !== values.length
    ) {
      throw new BadRequestException(
        `${field} must contain unique non-empty values`,
      );
    }
    return normalized;
  }

  private objectString(
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

  private objectStringArray(
    value: Record<string, unknown>,
    key: string,
    objectName: string,
    allowEmpty = false,
  ) {
    const candidate = value[key];
    if (!Array.isArray(candidate)) {
      throw new BadRequestException(`${objectName}.${key} must be an array`);
    }
    return this.uniqueStrings(
      candidate.map((item) =>
        typeof item === 'string' ? item : String(item ?? ''),
      ),
      `${objectName}.${key}`,
      allowEmpty,
    );
  }

  private parseObject(value: string, field: string) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new ConflictException(
        `Stored professional-service ${field} is invalid`,
      );
    }
  }

  private parseArray(value: string, field: string) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('not an array');
      }
      return parsed;
    } catch {
      throw new ConflictException(
        `Stored professional-service ${field} is invalid`,
      );
    }
  }

  private validateDefinitions(dto: CreateProfessionalServiceEngagementDto) {
    for (const key of ['objectives', 'inScope', 'outOfScope']) {
      this.objectStringArray(dto.scope, key, 'scope', key === 'outOfScope');
    }
    const deliverableKeys = new Set<string>();
    const deliverables = dto.deliverables.map((definition, index) => {
      const key = this.objectString(
        definition,
        'key',
        `deliverables[${index}]`,
      );
      if (deliverableKeys.has(key)) {
        throw new BadRequestException(`Duplicate deliverable key '${key}'`);
      }
      deliverableKeys.add(key);
      return {
        key,
        title: this.objectString(definition, 'title', `deliverables[${index}]`),
        acceptanceEvidence: this.objectString(
          definition,
          'acceptanceEvidence',
          `deliverables[${index}]`,
        ),
      };
    });
    const criterionKeys = new Set<string>();
    const criteria = dto.acceptanceCriteria.map((criterion, index) => {
      const key = this.objectString(
        criterion,
        'key',
        `acceptanceCriteria[${index}]`,
      );
      if (criterionKeys.has(key)) {
        throw new BadRequestException(
          `Duplicate acceptance criterion '${key}'`,
        );
      }
      criterionKeys.add(key);
      return {
        key,
        description: this.objectString(
          criterion,
          'description',
          `acceptanceCriteria[${index}]`,
        ),
      };
    });
    const allowCorrections = dto.correctionRetestPolicy.allowCorrections;
    const retestRequired = dto.correctionRetestPolicy.retestRequiredOnFailure;
    const maxRounds = dto.correctionRetestPolicy.maxRounds;
    if (
      typeof allowCorrections !== 'boolean' ||
      typeof retestRequired !== 'boolean' ||
      typeof maxRounds !== 'number' ||
      !Number.isInteger(maxRounds) ||
      maxRounds < 1 ||
      maxRounds > 5
    ) {
      throw new BadRequestException(
        'correctionRetestPolicy requires explicit allowCorrections, retestRequiredOnFailure and maxRounds (1-5)',
      );
    }
    return { deliverables, criteria };
  }

  private validateCommercialRules(dto: CreateProfessionalServiceEngagementDto) {
    if (
      dto.overagePolicy === 'ALLOW_CAPPED' &&
      (!dto.overageCapHours || dto.overageCapHours <= 0)
    ) {
      throw new BadRequestException(
        'ALLOW_CAPPED requires positive overageCapHours',
      );
    }
    if (
      ['BLOCK', 'TRACK_ONLY'].includes(dto.overagePolicy) &&
      dto.overageCapHours !== undefined
    ) {
      throw new BadRequestException(
        `${dto.overagePolicy} cannot define overageCapHours`,
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
    if (dto.allocationPeriod === 'PROJECT' && dto.rolloverPolicy !== 'NONE') {
      throw new BadRequestException(
        'PROJECT hour allocation cannot define rollover',
      );
    }
    if (dto.pricingMode === 'FIXED_FEE' && dto.overagePolicy !== 'TRACK_ONLY') {
      throw new BadRequestException(
        'FIXED_FEE work must track internal variance without automatic customer overage',
      );
    }
  }

  private validateServiceSpecific(
    dto: CreateProfessionalServiceEngagementDto,
    termStart: Date,
    termEnd: Date,
  ) {
    if (dto.serviceType === 'VCISO') {
      if (
        !['HOUR_BANK', 'RETAINED'].includes(dto.pricingMode) ||
        !['MONTHLY', 'QUARTERLY'].includes(dto.allocationPeriod) ||
        !dto.meetingCadence?.trim() ||
        !dto.reviewCadence?.trim()
      ) {
        throw new BadRequestException(
          'vCISO requires an HOUR_BANK or RETAINED monthly/quarterly allocation with meeting and review cadence',
        );
      }
    }
    if (
      ['ASSESSMENT', 'TABLETOP', 'PENETRATION_TEST'].includes(dto.serviceType)
    ) {
      const scheduled = dto.scheduledServiceAt
        ? new Date(dto.scheduledServiceAt)
        : null;
      if (
        !scheduled ||
        Number.isNaN(scheduled.getTime()) ||
        scheduled < termStart ||
        scheduled > termEnd
      ) {
        throw new BadRequestException(
          `${dto.serviceType} requires a scheduled workshop/test date within the SOW term`,
        );
      }
    }
    if (dto.serviceType === 'PENETRATION_TEST') {
      const authorization = dto.penTestAuthorization;
      const rules = dto.rulesOfEngagement;
      const tester = dto.testerAssurance;
      const report = dto.reportTreatment;
      if (!authorization || !rules || !tester || !report) {
        throw new BadRequestException(
          'Penetration tests require authorization, rules of engagement, tester assurance and report treatment',
        );
      }
      this.objectString(
        authorization,
        'customerAuthorizer',
        'penTestAuthorization',
      );
      this.objectString(
        authorization,
        'authorizationReference',
        'penTestAuthorization',
      );
      this.objectStringArray(
        authorization,
        'allowedTargets',
        'penTestAuthorization',
      );
      this.objectStringArray(rules, 'permittedTechniques', 'rulesOfEngagement');
      this.objectStringArray(rules, 'prohibitedActions', 'rulesOfEngagement');
      this.objectString(rules, 'testWindowStart', 'rulesOfEngagement');
      this.objectString(rules, 'testWindowEnd', 'rulesOfEngagement');
      this.objectString(rules, 'emergencyStopContact', 'rulesOfEngagement');
      this.objectString(rules, 'dataHandlingReference', 'rulesOfEngagement');
      const authorizationStart = new Date(
        this.objectString(authorization, 'validFrom', 'penTestAuthorization'),
      );
      const authorizationEnd = new Date(
        this.objectString(authorization, 'validUntil', 'penTestAuthorization'),
      );
      const testWindowStart = new Date(
        this.objectString(rules, 'testWindowStart', 'rulesOfEngagement'),
      );
      const testWindowEnd = new Date(
        this.objectString(rules, 'testWindowEnd', 'rulesOfEngagement'),
      );
      const scheduled = new Date(dto.scheduledServiceAt!);
      if (
        [
          authorizationStart,
          authorizationEnd,
          testWindowStart,
          testWindowEnd,
        ].some((value) => Number.isNaN(value.getTime())) ||
        authorizationEnd <= authorizationStart ||
        testWindowEnd <= testWindowStart ||
        authorizationStart > testWindowStart ||
        authorizationEnd < testWindowEnd ||
        testWindowStart < termStart ||
        testWindowEnd > termEnd ||
        scheduled < testWindowStart ||
        scheduled > testWindowEnd
      ) {
        throw new BadRequestException(
          'Penetration-test authorization must cover a valid rules-of-engagement window and scheduled test date inside the SOW term',
        );
      }
      if (tester.independent !== true) {
        throw new BadRequestException(
          'testerAssurance.independent must be true',
        );
      }
      this.objectString(tester, 'testerReference', 'testerAssurance');
      this.objectStringArray(
        tester,
        'qualificationReferences',
        'testerAssurance',
      );
      this.objectString(tester, 'conflictCheckReference', 'testerAssurance');
      this.objectString(report, 'classification', 'reportTreatment');
      this.objectString(report, 'distribution', 'reportTreatment');
      this.objectString(report, 'retentionPolicyReference', 'reportTreatment');
      if (typeof report.redactionRequired !== 'boolean') {
        throw new BadRequestException(
          'reportTreatment.redactionRequired must be explicit',
        );
      }
    }
    if (dto.serviceType === 'AUDIT_EVIDENCE_PROJECT') {
      if (
        !dto.frameworkKey?.trim() ||
        !dto.frameworkVersion?.trim() ||
        !dto.sourceDataResponsibilities
      ) {
        throw new BadRequestException(
          'Audit/evidence projects require framework key/version and source/data responsibilities',
        );
      }
      this.objectStringArray(
        dto.sourceDataResponsibilities,
        'customer',
        'sourceDataResponsibilities',
      );
      this.objectStringArray(
        dto.sourceDataResponsibilities,
        'provider',
        'sourceDataResponsibilities',
      );
      if (!dto.limitations.length) {
        throw new BadRequestException(
          'Audit/evidence projects require explicit limitations',
        );
      }
    }
  }

  private async requireEngagement(
    id: string,
    tenantId: string,
    environmentId: string,
  ) {
    const engagement =
      await this.prisma.professionalServiceEngagement.findFirst({
        where: { id, tenant_id: tenantId, environment_id: environmentId },
        include: { serviceObligation: true },
      });
    if (!engagement) {
      throw new NotFoundException(
        `Professional-service engagement '${id}' not found`,
      );
    }
    return engagement;
  }

  list(tenantId: string, environmentId: string, serviceType?: string) {
    return this.prisma.professionalServiceEngagement.findMany({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        ...(serviceType ? { service_type: serviceType } : {}),
      },
      orderBy: [{ engagement_key: 'asc' }, { version: 'desc' }],
    });
  }

  get(id: string, tenantId: string, environmentId: string) {
    return this.prisma.professionalServiceEngagement
      .findFirst({
        where: { id, tenant_id: tenantId, environment_id: environmentId },
        include: {
          serviceObligation: true,
          activities: { orderBy: { occurred_at: 'asc' } },
          deliverables: {
            orderBy: [{ deliverable_key: 'asc' }, { version: 'asc' }],
          },
          acceptanceEvents: { orderBy: { round: 'asc' } },
        },
      })
      .then((engagement) => {
        if (!engagement) {
          throw new NotFoundException(
            `Professional-service engagement '${id}' not found`,
          );
        }
        return engagement;
      });
  }

  async create(
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: CreateProfessionalServiceEngagementDto,
  ) {
    const engagementKey = this.required(dto.engagementKey, 'engagementKey');
    const sowReference = this.required(dto.sowReference, 'sowReference');
    const reason = this.required(dto.reason, 'reason');
    const termStart = new Date(dto.termStart);
    const termEnd = new Date(dto.termEnd);
    const hoursExpireAt = new Date(dto.hoursExpireAt);
    if (
      [termStart, termEnd, hoursExpireAt].some((value) =>
        Number.isNaN(value.getTime()),
      ) ||
      termEnd <= termStart ||
      hoursExpireAt < termStart ||
      hoursExpireAt > termEnd
    ) {
      throw new BadRequestException(
        'Term and hour expiry must be valid, ordered, and inside the SOW term',
      );
    }
    const definitions = this.validateDefinitions(dto);
    this.validateCommercialRules(dto);
    this.validateServiceSpecific(dto, termStart, termEnd);
    const requiredInputs = this.uniqueStrings(
      dto.requiredInputs,
      'requiredInputs',
    );
    const customerResponsibilities = this.uniqueStrings(
      dto.customerResponsibilities,
      'customerResponsibilities',
    );
    const providerResponsibilities = this.uniqueStrings(
      dto.providerResponsibilities,
      'providerResponsibilities',
    );
    const limitations = this.uniqueStrings(
      dto.limitations,
      'limitations',
      true,
    );
    const [contract, obligation, binding, price] = await Promise.all([
      this.prisma.contract.findUnique({ where: { id: dto.contractId } }),
      this.prisma.serviceObligation.findFirst({
        where: {
          id: dto.serviceObligationId,
          tenant_id: tenantId,
          environment_id: environmentId,
          contract_id: dto.contractId,
          obligation_type: OBLIGATION_TYPE[dto.serviceType],
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
      this.prisma.priceBook.findUnique({
        where: { id: dto.priceBookId },
        include: { product: true },
      }),
    ]);
    if (
      !contract ||
      contract.status !== 'ACTIVE' ||
      contract.commercial_account_id !== dto.commercialAccountId ||
      termStart < contract.term_start ||
      termEnd > contract.term_end
    ) {
      throw new ConflictException(
        'Professional service requires its matching ACTIVE contract and a SOW term inside the contract term',
      );
    }
    if (!obligation || !binding) {
      throw new ConflictException(
        'Professional service requires its matching ACTIVE tenant-bound service obligation and account binding',
      );
    }
    if (
      !price ||
      price.status !== 'APPROVED' ||
      price.product.offer_family !== 'PROFESSIONAL_SERVICE' ||
      price.catalog_version_id !== contract.catalog_version_id ||
      (price.commercial_account_id &&
        price.commercial_account_id !== dto.commercialAccountId) ||
      !['GLOBAL', binding.region].includes(price.region) ||
      price.effective_from > termStart ||
      (price.effective_to && price.effective_to < termEnd)
    ) {
      throw new ConflictException(
        'priceBookId must be an approved professional-service price compatible with account, catalog, region and term',
      );
    }
    const latest = await this.prisma.professionalServiceEngagement.findFirst({
      where: {
        tenant_id: tenantId,
        environment_id: environmentId,
        engagement_key: engagementKey,
      },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const unitPrice = Number(price.unit_price);
    const contractedAmount = Math.max(
      Number(price.minimum_commit),
      dto.pricingMode === 'FIXED_FEE'
        ? unitPrice
        : unitPrice * dto.includedHours,
    );
    const hourlyRate =
      dto.pricingMode === 'FIXED_FEE'
        ? null
        : Number(price.overage_rate) > 0
          ? Number(price.overage_rate)
          : unitPrice;
    const scheduledServiceAt = dto.scheduledServiceAt
      ? new Date(dto.scheduledServiceAt)
      : null;
    return this.prisma.$transaction(async (tx) => {
      const engagement = await tx.professionalServiceEngagement.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          commercial_account_id: dto.commercialAccountId,
          contract_id: dto.contractId,
          service_obligation_id: dto.serviceObligationId,
          engagement_key: engagementKey,
          version,
          service_type: dto.serviceType,
          sow_reference: sowReference,
          price_book_id: dto.priceBookId,
          term_start: termStart,
          term_end: termEnd,
          scheduled_service_at: scheduledServiceAt,
          scope: JSON.stringify(dto.scope),
          required_inputs: JSON.stringify(requiredInputs),
          customer_responsibilities: JSON.stringify(customerResponsibilities),
          provider_responsibilities: JSON.stringify(providerResponsibilities),
          deliverable_definitions: JSON.stringify(definitions.deliverables),
          acceptance_criteria: JSON.stringify(definitions.criteria),
          correction_retest_policy: JSON.stringify(dto.correctionRetestPolicy),
          pricing_mode: dto.pricingMode,
          currency: price.currency.toUpperCase(),
          contracted_amount: contractedAmount,
          allocation_period: dto.allocationPeriod,
          included_hours: dto.includedHours,
          hourly_rate: hourlyRate,
          warning_threshold_percent: dto.warningThresholdPercent,
          overage_policy: dto.overagePolicy,
          overage_cap_hours: dto.overageCapHours,
          rollover_policy: dto.rolloverPolicy,
          rollover_cap_hours: dto.rolloverCapHours,
          hours_expire_at: hoursExpireAt,
          meeting_cadence: dto.meetingCadence?.trim(),
          review_cadence: dto.reviewCadence?.trim(),
          pen_test_authorization: JSON.stringify(
            dto.penTestAuthorization ?? {},
          ),
          rules_of_engagement: JSON.stringify(dto.rulesOfEngagement ?? {}),
          tester_assurance: JSON.stringify(dto.testerAssurance ?? {}),
          report_treatment: JSON.stringify(dto.reportTreatment ?? {}),
          framework_key: dto.frameworkKey?.trim(),
          framework_version: dto.frameworkVersion?.trim(),
          source_data_responsibilities: JSON.stringify(
            dto.sourceDataResponsibilities ?? {},
          ),
          limitations: JSON.stringify(limitations),
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'PROFESSIONAL_SERVICE_PROFILE',
          objectType: 'ProfessionalServiceEngagement',
          objectId: engagement.id,
          tenantId,
          requestedBy,
          reason,
          proposedSnapshot: {
            ...dto,
            engagementKey,
            version,
            sowReference,
            currency: price.currency.toUpperCase(),
            contractedAmount,
            hourlyRate,
            deliverables: definitions.deliverables,
            acceptanceCriteria: definitions.criteria,
            noAutomaticInvoice: true,
          },
          financialImpact:
            contractedAmount +
            (dto.overageCapHours ?? 0) * Number(hourlyRate ?? 0),
          requiredApprovalRole: 'COMMERCIAL_APPROVER',
        },
        tx,
      );
      return tx.professionalServiceEngagement.update({
        where: { id: engagement.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async decideProfile(
    id: string,
    tenantId: string,
    environmentId: string,
    decidedBy: string,
    dto: DecideProfessionalServiceProfileDto,
  ) {
    const engagement = await this.requireEngagement(
      id,
      tenantId,
      environmentId,
    );
    if (engagement.status !== 'PENDING_APPROVAL' || !engagement.approval_id) {
      throw new ConflictException(`Engagement '${id}' has no pending approval`);
    }
    await this.approvals.decideApproval(
      engagement.approval_id,
      decidedBy,
      dto.decision,
      this.required(dto.reason, 'reason'),
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.professionalServiceEngagement.update({
        where: { id },
        data:
          dto.decision === 'APPROVED'
            ? {
                status: 'APPROVED',
                approved_by: decidedBy,
                approved_at: new Date(),
              }
            : { status: 'REJECTED' },
      });
      if (dto.decision === 'APPROVED') {
        await tx.commercialApproval.update({
          where: { id: engagement.approval_id! },
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
    dto: ActivateProfessionalServiceDto,
  ) {
    const engagement = await this.requireEngagement(
      id,
      tenantId,
      environmentId,
    );
    const now = new Date();
    if (
      engagement.status !== 'APPROVED' ||
      engagement.serviceObligation.status !== 'ACTIVE' ||
      now < engagement.term_start ||
      now > engagement.term_end
    ) {
      throw new ConflictException(
        'Activation requires an approved engagement, active matching obligation and current SOW term',
      );
    }
    const activationReference = this.required(
      dto.activationReference,
      'activationReference',
    );
    const readinessEvidenceRefs = this.uniqueStrings(
      dto.readinessEvidenceRefs,
      'readinessEvidenceRefs',
    );
    return this.prisma.professionalServiceEngagement.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        activated_by: activatedBy,
        activation_reference: activationReference,
        readiness_evidence_refs: JSON.stringify(readinessEvidenceRefs),
        activated_at: now,
      },
    });
  }

  private addUtcMonths(value: Date, months: number) {
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + months;
    const day = value.getUTCDate();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const result = new Date(value);
    result.setUTCDate(1);
    result.setUTCFullYear(year);
    result.setUTCMonth(month);
    result.setUTCDate(Math.min(day, lastDay));
    return result;
  }

  private periodFor(
    termStart: Date,
    termEnd: Date,
    allocationPeriod: string,
    occurredAt: Date,
  ) {
    if (allocationPeriod === 'PROJECT') {
      return { start: termStart, end: termEnd, months: 0 };
    }
    const months = allocationPeriod === 'MONTHLY' ? 1 : 3;
    let start = termStart;
    let end = this.addUtcMonths(start, months);
    while (end <= occurredAt && end < termEnd) {
      start = end;
      end = this.addUtcMonths(start, months);
    }
    return { start, end: end > termEnd ? termEnd : end, months };
  }

  async logActivity(
    id: string,
    tenantId: string,
    environmentId: string,
    actorId: string,
    dto: LogProfessionalServiceActivityDto,
  ) {
    const summary = this.required(dto.summary, 'summary');
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
        const engagement = await tx.professionalServiceEngagement.findFirst({
          where: { id, tenant_id: tenantId, environment_id: environmentId },
        });
        if (!engagement) {
          throw new NotFoundException(
            `Professional-service engagement '${id}' not found`,
          );
        }
        if (
          !['ACTIVE', 'CORRECTION_REQUIRED'].includes(engagement.status) ||
          occurredAt < engagement.term_start ||
          occurredAt > engagement.term_end ||
          occurredAt > engagement.hours_expire_at
        ) {
          throw new ConflictException(
            'Activity requires an active/correction engagement and unexpired contracted hours',
          );
        }
        if (
          engagement.service_type === 'PENETRATION_TEST' &&
          ['TEST_EXECUTION', 'RETEST'].includes(dto.activityType)
        ) {
          const rules = this.parseObject(
            engagement.rules_of_engagement,
            'rules of engagement',
          );
          const windowStart = new Date(
            this.objectString(rules, 'testWindowStart', 'rulesOfEngagement'),
          );
          const windowEnd = new Date(
            this.objectString(rules, 'testWindowEnd', 'rulesOfEngagement'),
          );
          if (occurredAt < windowStart || occurredAt > windowEnd) {
            throw new ConflictException(
              'Penetration-test execution is outside the authorized rules-of-engagement window',
            );
          }
        }
        const period = this.periodFor(
          engagement.term_start,
          engagement.term_end,
          engagement.allocation_period,
          occurredAt,
        );
        const currentEntries = await tx.professionalServiceActivity.findMany({
          where: {
            engagement_id: id,
            allocation_period_start: period.start,
          },
          orderBy: { occurred_at: 'asc' },
        });
        if (
          currentEntries.length &&
          occurredAt < currentEntries[currentEntries.length - 1].occurred_at
        ) {
          throw new ConflictException(
            'Activity timestamps must be append-ordered within an allocation period',
          );
        }
        const consumedPeriod = currentEntries.reduce(
          (sum, entry) => sum + Number(entry.hours),
          0,
        );
        let rollover = 0;
        if (period.months && period.start > engagement.term_start) {
          const previousEnd = period.start;
          const previousStart = this.addUtcMonths(previousEnd, -period.months);
          const previousEntries = await tx.professionalServiceActivity.findMany(
            {
              where: {
                engagement_id: id,
                allocation_period_start: previousStart,
              },
              orderBy: { occurred_at: 'asc' },
            },
          );
          const previousConsumed = previousEntries.reduce(
            (sum, entry) => sum + Number(entry.hours),
            0,
          );
          const previousAvailable = previousEntries.length
            ? Number(
                previousEntries[previousEntries.length - 1]
                  .included_available_after,
              )
            : Number(engagement.included_hours);
          const unused = Math.max(0, previousAvailable - previousConsumed);
          rollover =
            engagement.rollover_policy === 'FULL'
              ? unused
              : engagement.rollover_policy === 'CAPPED'
                ? Math.min(unused, Number(engagement.rollover_cap_hours ?? 0))
                : 0;
        }
        const includedAvailable = Number(engagement.included_hours) + rollover;
        const newPeriodTotal = consumedPeriod + dto.hours;
        const periodOverage = Math.max(0, newPeriodTotal - includedAvailable);
        const priorPeriodOverage = Math.max(
          0,
          consumedPeriod - includedAvailable,
        );
        const forecastPeriod =
          newPeriodTotal + Math.max(0, dto.expectedRemainingHours ?? 0);
        let entryType = 'STANDARD';
        let overageApprovalId: string | undefined;
        if (periodOverage > 0) {
          let allowed = false;
          if (engagement.overage_policy === 'TRACK_ONLY') {
            allowed = true;
            entryType = 'INTERNAL_VARIANCE';
          } else if (engagement.overage_policy === 'ALLOW_CAPPED') {
            allowed =
              periodOverage <= Number(engagement.overage_cap_hours ?? 0);
            entryType = 'PREAUTHORIZED_OVERAGE';
          } else if (engagement.overage_policy === 'REQUIRE_APPROVAL') {
            const approvals = await tx.commercialApproval.findMany({
              where: {
                tenant_id: tenantId,
                object_type: 'ProfessionalServiceEngagement',
                object_id: id,
                change_type: 'PROFESSIONAL_SERVICE_OVERAGE',
                status: 'APPROVED',
                OR: [{ expires_at: null }, { expires_at: { gte: new Date() } }],
              },
              orderBy: { requested_at: 'desc' },
            });
            const approval = approvals.find((candidate) => {
              const scope = this.parseObject(
                candidate.proposed_snapshot || '{}',
                'overage approval scope',
              ) as {
                allocationPeriodStart?: string;
                maxOverageHours?: number;
              };
              return (
                scope.allocationPeriodStart === period.start.toISOString() &&
                typeof scope.maxOverageHours === 'number' &&
                periodOverage <= scope.maxOverageHours
              );
            });
            if (approval) {
              allowed = true;
              entryType = 'APPROVED_OVERAGE';
              overageApprovalId = approval.id;
            }
          }
          if (!allowed) {
            throw new ConflictException(
              'Hours beyond the current allocation require a contracted cap or named period-specific approval',
            );
          }
        }
        const warningAt =
          includedAvailable * (engagement.warning_threshold_percent / 100);
        const thresholdState =
          periodOverage > 0
            ? 'OVERAGE'
            : forecastPeriod >= warningAt
              ? 'WARNING'
              : 'WITHIN_ALLOWANCE';
        const totalAfter = Number(engagement.consumed_hours) + dto.hours;
        const activity = await tx.professionalServiceActivity.create({
          data: {
            tenant_id: tenantId,
            environment_id: environmentId,
            engagement_id: id,
            activity_type: dto.activityType,
            entry_type: entryType,
            hours: dto.hours,
            allocation_period_start: period.start,
            allocation_period_end: period.end,
            included_available_after: includedAvailable,
            consumed_period_after: newPeriodTotal,
            overage_period_after: periodOverage,
            forecast_period_after: forecastPeriod,
            total_engagement_after: totalAfter,
            threshold_state: thresholdState,
            overage_approval_id: overageApprovalId,
            summary,
            evidence_reference: evidenceReference,
            actor_id: actorId,
            occurred_at: occurredAt,
          },
        });
        const updated = await tx.professionalServiceEngagement.update({
          where: { id },
          data: {
            consumed_hours: totalAfter,
            overage_hours:
              Number(engagement.overage_hours) +
              Math.max(0, periodOverage - priorPeriodOverage),
            forecast_hours: forecastPeriod,
            threshold_state: thresholdState,
          },
        });
        return { engagement: updated, activity };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async requestOverage(
    id: string,
    tenantId: string,
    environmentId: string,
    requestedBy: string,
    dto: RequestProfessionalServiceOverageDto,
  ) {
    const engagement = await this.requireEngagement(
      id,
      tenantId,
      environmentId,
    );
    if (
      engagement.status !== 'ACTIVE' ||
      engagement.overage_policy !== 'REQUIRE_APPROVAL'
    ) {
      throw new ConflictException(
        'Named overage approval requires an active engagement with REQUIRE_APPROVAL policy',
      );
    }
    const periodAt = dto.periodAt ? new Date(dto.periodAt) : new Date();
    if (
      Number.isNaN(periodAt.getTime()) ||
      periodAt < engagement.term_start ||
      periodAt > engagement.term_end
    ) {
      throw new BadRequestException('periodAt must be inside the SOW term');
    }
    const period = this.periodFor(
      engagement.term_start,
      engagement.term_end,
      engagement.allocation_period,
      periodAt,
    );
    if (
      engagement.overage_cap_hours &&
      dto.maxOverageHours > Number(engagement.overage_cap_hours)
    ) {
      throw new ConflictException(
        'Requested overage exceeds the SOW maximum approval cap',
      );
    }
    return this.approvals.requestApproval({
      changeType: 'PROFESSIONAL_SERVICE_OVERAGE',
      objectType: 'ProfessionalServiceEngagement',
      objectId: id,
      tenantId,
      requestedBy,
      reason: this.required(dto.reason, 'reason'),
      proposedSnapshot: {
        allocationPeriodStart: period.start.toISOString(),
        allocationPeriodEnd: period.end.toISOString(),
        maxOverageHours: dto.maxOverageHours,
        hourlyRate: Number(engagement.hourly_rate ?? 0),
        namedCustomerAuthorizer: this.required(
          dto.namedCustomerAuthorizer,
          'namedCustomerAuthorizer',
        ),
        customerApprovalReference: this.required(
          dto.customerApprovalReference,
          'customerApprovalReference',
        ),
        noAutomaticInvoice: true,
      },
      financialImpact:
        dto.maxOverageHours * Number(engagement.hourly_rate ?? 0),
      requiredApprovalRole: 'COMMERCIAL_APPROVER',
      expiresAt: period.end,
    });
  }

  async submitDeliverable(
    id: string,
    tenantId: string,
    environmentId: string,
    submittedBy: string,
    dto: SubmitProfessionalServiceDeliverableDto,
  ) {
    const engagement = await this.requireEngagement(
      id,
      tenantId,
      environmentId,
    );
    if (!['ACTIVE', 'CORRECTION_REQUIRED'].includes(engagement.status)) {
      throw new ConflictException(
        'Deliverables can only be submitted during active work or a correction round',
      );
    }
    const deliverableKey = this.required(dto.deliverableKey, 'deliverableKey');
    const definitions = this.parseArray(
      engagement.deliverable_definitions,
      'deliverable definitions',
    ) as {
      key: string;
      title: string;
    }[];
    const definition = definitions.find(
      (candidate) => candidate.key === deliverableKey,
    );
    if (!definition) {
      throw new ConflictException(
        `Deliverable '${deliverableKey}' is outside the approved SOW`,
      );
    }
    if (this.required(dto.title, 'title') !== definition.title) {
      throw new ConflictException(
        `Deliverable '${deliverableKey}' title must match the approved SOW`,
      );
    }
    const evidenceReferences = this.uniqueStrings(
      dto.evidenceReferences,
      'evidenceReferences',
    );
    const limitations = this.uniqueStrings(
      dto.limitations,
      'limitations',
      true,
    );
    const latest = await this.prisma.professionalServiceDeliverable.findFirst({
      where: { engagement_id: id, deliverable_key: deliverableKey },
      orderBy: { version: 'desc' },
    });
    if (engagement.status === 'ACTIVE' && latest) {
      throw new ConflictException(
        'A submitted deliverable can only be revised through a customer correction round',
      );
    }
    if (engagement.status === 'CORRECTION_REQUIRED') {
      if (!latest || dto.correctionOfId !== latest.id) {
        throw new ConflictException(
          'Correction submission must reference the latest prior deliverable version',
        );
      }
      const policy = this.parseObject(
        engagement.correction_retest_policy,
        'correction/retest policy',
      );
      if (policy.allowCorrections !== true) {
        throw new ConflictException('The SOW does not permit corrections');
      }
      if (
        policy.retestRequiredOnFailure === true &&
        !dto.retestReference?.trim()
      ) {
        throw new ConflictException(
          'The SOW requires a retest reference for corrected delivery',
        );
      }
    } else if (dto.correctionOfId) {
      throw new ConflictException(
        'correctionOfId is only valid in a correction round',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const deliverable = await tx.professionalServiceDeliverable.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          engagement_id: id,
          deliverable_key: deliverableKey,
          version: (latest?.version ?? 0) + 1,
          title: definition.title,
          content_reference: this.required(
            dto.contentReference,
            'contentReference',
          ),
          evidence_references: JSON.stringify(evidenceReferences),
          limitations: JSON.stringify(limitations),
          correction_of_id: dto.correctionOfId,
          retest_reference: dto.retestReference?.trim(),
          submitted_by: submittedBy,
        },
      });
      if (dto.submissionComplete === true) {
        const all = await tx.professionalServiceDeliverable.findMany({
          where: { engagement_id: id },
          orderBy: [{ deliverable_key: 'asc' }, { version: 'desc' }],
        });
        const latestKeys = new Set(all.map((item) => item.deliverable_key));
        if (
          engagement.status === 'ACTIVE' &&
          definitions.some((definition) => !latestKeys.has(definition.key))
        ) {
          throw new ConflictException(
            'Initial acceptance submission must include every contracted deliverable',
          );
        }
        await tx.professionalServiceEngagement.update({
          where: { id },
          data: { status: 'AWAITING_ACCEPTANCE' },
        });
      }
      return deliverable;
    });
  }

  async decideAcceptance(
    id: string,
    tenantId: string,
    environmentId: string,
    decidedBy: string,
    dto: DecideProfessionalServiceAcceptanceDto,
  ) {
    const engagement = await this.requireEngagement(
      id,
      tenantId,
      environmentId,
    );
    if (engagement.status !== 'AWAITING_ACCEPTANCE') {
      throw new ConflictException(
        'Customer decision requires a completed deliverable submission',
      );
    }
    const deliverables =
      await this.prisma.professionalServiceDeliverable.findMany({
        where: { engagement_id: id },
        orderBy: [{ deliverable_key: 'asc' }, { version: 'desc' }],
      });
    const latestByKey = new Map<string, (typeof deliverables)[number]>();
    for (const deliverable of deliverables) {
      if (!latestByKey.has(deliverable.deliverable_key)) {
        latestByKey.set(deliverable.deliverable_key, deliverable);
      }
    }
    const latestIds = [...latestByKey.values()].map((item) => item.id).sort();
    const reviewedIds = [...new Set(dto.reviewedDeliverableIds)].sort();
    if (
      latestIds.length !== reviewedIds.length ||
      latestIds.some((value, index) => value !== reviewedIds[index])
    ) {
      throw new ConflictException(
        'Acceptance decision must review every latest deliverable version',
      );
    }
    const criteria = this.parseArray(
      engagement.acceptance_criteria,
      'acceptance criteria',
    ) as {
      key: string;
    }[];
    let allMet = true;
    for (const criterion of criteria) {
      const result = dto.criteriaResults[criterion.key];
      if (
        !result ||
        typeof result !== 'object' ||
        typeof (result as Record<string, unknown>).met !== 'boolean' ||
        typeof (result as Record<string, unknown>).evidenceReference !==
          'string' ||
        !(result as Record<string, unknown>).evidenceReference
          ?.toString()
          .trim()
      ) {
        throw new BadRequestException(
          `criteriaResults.${criterion.key} requires met and evidenceReference`,
        );
      }
      allMet = allMet && (result as Record<string, unknown>).met === true;
    }
    if (dto.decision === 'ACCEPTED' && !allMet) {
      throw new ConflictException(
        'All contracted acceptance criteria must be met before acceptance',
      );
    }
    if (dto.decision === 'CORRECTION_REQUIRED' && allMet) {
      throw new ConflictException(
        'A correction decision must identify at least one unmet acceptance criterion',
      );
    }
    const policy = this.parseObject(
      engagement.correction_retest_policy,
      'correction/retest policy',
    );
    const priorRounds =
      await this.prisma.professionalServiceAcceptanceEvent.count({
        where: { engagement_id: id },
      });
    const round = priorRounds + 1;
    if (dto.decision === 'CORRECTION_REQUIRED') {
      if (
        policy.allowCorrections !== true ||
        round >= Number(policy.maxRounds) ||
        !dto.correctionScope?.trim()
      ) {
        throw new ConflictException(
          'Correction request is outside the contracted correction rounds or lacks scope',
        );
      }
      if (
        policy.retestRequiredOnFailure === true &&
        dto.retestRequired !== true
      ) {
        throw new ConflictException(
          'The contracted correction policy requires a retest',
        );
      }
    }
    const namedCustomerAuthorizer = this.required(
      dto.namedCustomerAuthorizer,
      'namedCustomerAuthorizer',
    );
    const customerDecisionReference = this.required(
      dto.customerDecisionReference,
      'customerDecisionReference',
    );
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.professionalServiceAcceptanceEvent.create({
        data: {
          tenant_id: tenantId,
          environment_id: environmentId,
          engagement_id: id,
          round,
          decision: dto.decision,
          reviewed_deliverable_ids: JSON.stringify(reviewedIds),
          criteria_results: JSON.stringify(dto.criteriaResults),
          named_customer_authorizer: namedCustomerAuthorizer,
          customer_decision_reference: customerDecisionReference,
          correction_scope: dto.correctionScope?.trim(),
          retest_required: dto.retestRequired === true,
          decided_by: decidedBy,
        },
      });
      const updated = await tx.professionalServiceEngagement.update({
        where: { id },
        data:
          dto.decision === 'ACCEPTED'
            ? {
                status: 'ACCEPTED',
                accepted_by_customer: namedCustomerAuthorizer,
                customer_acceptance_reference: customerDecisionReference,
                accepted_at: new Date(),
                completed_at: new Date(),
              }
            : { status: 'CORRECTION_REQUIRED' },
      });
      if (dto.decision === 'ACCEPTED') {
        if (engagement.serviceObligation.status !== 'ACTIVE') {
          throw new ConflictException(
            'Accepted delivery requires its service obligation to remain ACTIVE',
          );
        }
        await tx.serviceObligation.update({
          where: { id: engagement.service_obligation_id },
          data: {
            status: 'DELIVERED',
            delivered_at: new Date(),
            evidence_ref: customerDecisionReference,
          },
        });
      }
      return { engagement: updated, acceptanceEvent: event };
    });
  }
}
