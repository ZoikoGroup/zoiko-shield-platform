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
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const PROGRAM_TYPES = ['DESIGN_PARTNER', 'EVALUATION', 'PILOT'] as const;
const OFFER_TYPES = [
  'MANAGED_DEFENSE',
  'CONTINUOUS_ASSURANCE',
  'EXPOSURE_MANAGEMENT',
  'AI_SECURITY',
] as const;

export class CreateEvaluationProgramDto {
  @IsString()
  programKey!: string;

  @IsIn(PROGRAM_TYPES)
  programType!: (typeof PROGRAM_TYPES)[number];

  @IsUUID()
  commercialAccountId!: string;

  @IsString()
  tenantId!: string;

  @IsString()
  environmentId!: string;

  @IsString()
  region!: string;

  @IsISO8601()
  startsAt!: Date;

  @IsISO8601()
  endsAt!: Date;

  @IsArray()
  dataClasses!: string[];

  @IsArray()
  connectorScope!: string[];

  @IsArray()
  entitlementScope!: string[];

  @IsArray()
  serviceCoverage!: string[];

  @IsIn(['NONE', 'OBSERVE', 'RECOMMEND', 'CUSTOMER_APPROVED_ACTIONS'])
  responseAuthority!:
    'NONE' | 'OBSERVE' | 'RECOMMEND' | 'CUSTOMER_APPROVED_ACTIONS';

  @IsIn(['NOT_REQUIRED', 'REQUIRED_BEFORE_ACTIVATION', 'CONTRACTED_WAIVER'])
  paymentRequirement!:
    'NOT_REQUIRED' | 'REQUIRED_BEFORE_ACTIVATION' | 'CONTRACTED_WAIVER';

  @IsOptional()
  @IsUUID()
  paymentReferenceId?: string;

  @IsIn(['EXPIRE', 'REQUIRE_APPROVED_ORDER', 'MANUAL_REVIEW'])
  conversionPolicy!: 'EXPIRE' | 'REQUIRE_APPROVED_ORDER' | 'MANUAL_REVIEW';
}

export class SubmitEvaluationProgramDto {
  @IsString()
  reason!: string;
}

export class DecideEvaluationProgramDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

export class ConvertEvaluationProgramDto {
  @IsUUID()
  orderId!: string;
}

@Injectable()
export class EvaluationProgramService {
  private readonly logger = new Logger(EvaluationProgramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  async getProgram(id: string) {
    const program = await this.prisma.evaluationProgram.findUnique({
      where: { id },
      include: { entitlements: true },
    });
    if (!program) {
      throw new NotFoundException(`Evaluation program '${id}' not found`);
    }
    return program;
  }

  private requireNonEmptyStrings(field: string, values: string[]) {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      values.some((value) => typeof value !== 'string' || !value.trim())
    ) {
      throw new BadRequestException(
        `${field} must contain at least one non-empty value`,
      );
    }
  }

  private async requireActiveBinding(program: {
    commercial_account_id: string;
    tenant_id: string;
    environment_id: string;
    region: string;
  }) {
    const now = new Date();
    const binding = await this.prisma.commercialAccountTenantBinding.findFirst({
      where: {
        commercial_account_id: program.commercial_account_id,
        tenant_id: program.tenant_id,
        environment_id: program.environment_id,
        region: program.region,
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
    });
    if (!binding) {
      throw new ConflictException({
        statusCode: 409,
        error: 'EVALUATION_BINDING_REQUIRED',
        message:
          'Program account, tenant, environment and region require an exact active binding',
      });
    }
    return binding;
  }

  async createProgram(dto: CreateEvaluationProgramDto, requestedBy: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt || endsAt <= new Date()) {
      throw new BadRequestException(
        'Program endsAt must be in the future and later than startsAt',
      );
    }
    this.requireNonEmptyStrings('dataClasses', dto.dataClasses);
    this.requireNonEmptyStrings('connectorScope', dto.connectorScope);
    this.requireNonEmptyStrings('entitlementScope', dto.entitlementScope);
    this.requireNonEmptyStrings('serviceCoverage', dto.serviceCoverage);
    const invalidOffers = dto.entitlementScope.filter(
      (offer) => !OFFER_TYPES.includes(offer as (typeof OFFER_TYPES)[number]),
    );
    if (invalidOffers.length) {
      throw new BadRequestException(
        `Unsupported evaluation entitlements: ${invalidOffers.join(', ')}`,
      );
    }
    if (
      dto.paymentRequirement === 'REQUIRED_BEFORE_ACTIVATION' &&
      !dto.paymentReferenceId
    ) {
      throw new BadRequestException(
        'paymentReferenceId is required when payment is required before activation',
      );
    }

    const account = await this.prisma.commercialAccount.findUnique({
      where: { id: dto.commercialAccountId },
    });
    if (!account || account.status !== 'ACTIVE') {
      throw new ConflictException(
        'Evaluation programs require an ACTIVE commercial account',
      );
    }
    await this.requireActiveBinding({
      commercial_account_id: dto.commercialAccountId,
      tenant_id: dto.tenantId,
      environment_id: dto.environmentId,
      region: dto.region,
    });

    return this.prisma.evaluationProgram.create({
      data: {
        program_key: dto.programKey,
        program_type: dto.programType,
        commercial_account_id: dto.commercialAccountId,
        tenant_id: dto.tenantId,
        environment_id: dto.environmentId,
        region: dto.region,
        starts_at: startsAt,
        ends_at: endsAt,
        data_classes: JSON.stringify(dto.dataClasses),
        connector_scope: JSON.stringify(dto.connectorScope),
        entitlement_scope: JSON.stringify([...new Set(dto.entitlementScope)]),
        service_coverage: JSON.stringify(dto.serviceCoverage),
        response_authority: dto.responseAuthority,
        payment_requirement: dto.paymentRequirement,
        payment_reference_id: dto.paymentReferenceId,
        conversion_policy: dto.conversionPolicy,
        expiry_action: 'REVOKE_ENTITLEMENTS',
        status: 'DRAFT',
        requested_by: requestedBy,
      },
    });
  }

  async submitProgram(id: string, requestedBy: string, reason: string) {
    const program = await this.getProgram(id);
    if (program.status !== 'DRAFT' && program.status !== 'REJECTED') {
      throw new ConflictException(
        `Evaluation program '${id}' is ${program.status}; only DRAFT or REJECTED programs can be submitted`,
      );
    }
    if (program.ends_at <= new Date()) {
      throw new ConflictException(
        'An expired program window cannot be submitted',
      );
    }
    await this.requireActiveBinding(program);

    return this.prisma.$transaction(async (tx) => {
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'EVALUATION_PROGRAM',
          objectType: 'EvaluationProgram',
          objectId: program.id,
          tenantId: program.tenant_id,
          requestedBy,
          reason,
          beforeSnapshot: {
            status: program.status,
            approvalId: program.approval_id,
          },
          proposedSnapshot: {
            programType: program.program_type,
            startsAt: program.starts_at,
            endsAt: program.ends_at,
            region: program.region,
            dataClasses: JSON.parse(program.data_classes),
            connectorScope: JSON.parse(program.connector_scope),
            entitlementScope: JSON.parse(program.entitlement_scope),
            serviceCoverage: JSON.parse(program.service_coverage),
            responseAuthority: program.response_authority,
            paymentRequirement: program.payment_requirement,
            conversionPolicy: program.conversion_policy,
            expiryAction: program.expiry_action,
          },
          requiredApprovalRole: 'FINANCE_COMMERCIAL_APPROVER',
          expiresAt: program.ends_at,
        },
        tx,
      );
      await tx.evaluationProgram.update({
        where: { id },
        data: { status: 'PENDING_APPROVAL', approval_id: approval.id },
      });
      return approval;
    });
  }

  async decideProgram(
    id: string,
    approverId: string,
    dto: DecideEvaluationProgramDto,
  ) {
    const program = await this.getProgram(id);
    if (program.status !== 'PENDING_APPROVAL' || !program.approval_id) {
      throw new ConflictException('Program has no pending linked approval');
    }
    const approval = await this.approvals.decideApproval(
      program.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    await this.prisma.evaluationProgram.update({
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
    return approval;
  }

  async activateProgram(id: string, actor: string) {
    const program = await this.getProgram(id);
    const now = new Date();
    if (program.status !== 'APPROVED') {
      throw new ConflictException(`Program '${id}' is not APPROVED`);
    }
    if (program.starts_at > now) {
      throw new ConflictException(
        `Program '${id}' cannot activate before startsAt`,
      );
    }
    if (program.ends_at <= now) {
      throw new ConflictException(`Program '${id}' has already expired`);
    }
    await this.requireActiveBinding(program);
    if (program.payment_requirement === 'REQUIRED_BEFORE_ACTIVATION') {
      const payment = await this.prisma.payment.findFirst({
        where: {
          id: program.payment_reference_id ?? '',
          commercial_account_id: program.commercial_account_id,
          status: 'SETTLED',
        },
      });
      if (!payment) {
        throw new ConflictException(
          'Required payment is not SETTLED for this commercial account',
        );
      }
    }

    const offers = JSON.parse(program.entitlement_scope) as string[];
    const collision = await this.prisma.entitlement.findFirst({
      where: {
        tenant_id: program.tenant_id,
        offer_type: { in: offers },
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
    });
    if (collision) {
      throw new ConflictException(
        `Tenant already has an ACTIVE '${collision.offer_type}' entitlement`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.entitlement.createMany({
        data: offers.map((offerType) => ({
          commercial_account_id: program.commercial_account_id,
          tenant_id: program.tenant_id,
          offer_type: offerType,
          source_type: 'EVALUATION_PROGRAM',
          source_id: program.id,
          evaluation_program_id: program.id,
          status: 'ACTIVE',
          effective_from: program.starts_at,
          effective_to: program.ends_at,
        })),
      });
      const active = await tx.evaluationProgram.update({
        where: { id },
        data: { status: 'ACTIVE', activated_at: now },
      });
      await tx.commercialApproval.update({
        where: { id: program.approval_id! },
        data: { status: 'APPLIED', applied_at: now },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'evaluation_program.activated',
          tenant_id: program.tenant_id,
          actor,
          payload: JSON.stringify({
            programId: id,
            offers,
            endsAt: program.ends_at,
          }),
          idempotency_key: `evaluation-program-activated-${id}`,
        },
      });
      return active;
    });
  }

  async expireProgram(
    id: string,
    actor = 'system:evaluation-program-scheduler',
  ) {
    const program = await this.getProgram(id);
    if (
      !['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE'].includes(
        program.status,
      )
    ) {
      throw new ConflictException(
        `Program '${id}' is already terminal in ${program.status}`,
      );
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.entitlement.updateMany({
        where: { evaluation_program_id: id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', effective_to: now },
      });
      const expired = await tx.evaluationProgram.update({
        where: { id },
        data: { status: 'EXPIRED', expired_at: now },
      });
      if (program.status === 'PENDING_APPROVAL' && program.approval_id) {
        await tx.commercialApproval.update({
          where: { id: program.approval_id },
          data: { status: 'EXPIRED' },
        });
      }
      await tx.commercialEvent.create({
        data: {
          event_type: 'evaluation_program.expired',
          tenant_id: program.tenant_id,
          actor,
          payload: JSON.stringify({
            programId: id,
            expiryAction: 'REVOKE_ENTITLEMENTS',
          }),
          idempotency_key: `evaluation-program-expired-${id}`,
        },
      });
      return expired;
    });
  }

  async convertProgram(id: string, orderId: string, actor: string) {
    const program = await this.getProgram(id);
    if (program.status !== 'ACTIVE') {
      throw new ConflictException(
        'Only an ACTIVE evaluation program can convert',
      );
    }
    if (program.conversion_policy === 'EXPIRE') {
      throw new ConflictException('This program conversion policy is EXPIRE');
    }
    const order = await this.prisma.commercialOrder.findUnique({
      where: { id: orderId },
    });
    if (
      !order ||
      order.status !== 'PROVISIONED' ||
      order.commercial_account_id !== program.commercial_account_id ||
      order.tenant_id !== program.tenant_id
    ) {
      throw new ConflictException(
        'Conversion requires a PROVISIONED order bound to the same account and tenant',
      );
    }
    const offers = JSON.parse(program.entitlement_scope) as string[];
    const replacementEntitlements = await this.prisma.entitlement.findMany({
      where: {
        commercial_account_id: program.commercial_account_id,
        tenant_id: program.tenant_id,
        offer_type: { in: offers },
        source_type: { not: 'EVALUATION_PROGRAM' },
        status: 'ACTIVE',
      },
      select: { offer_type: true },
    });
    const covered = new Set(
      replacementEntitlements.map((item) => item.offer_type),
    );
    const uncovered = offers.filter((offer) => !covered.has(offer));
    if (uncovered.length) {
      throw new ConflictException(
        `Conversion order has not activated replacement entitlements for: ${uncovered.join(', ')}`,
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.entitlement.updateMany({
        where: { evaluation_program_id: id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', effective_to: now },
      });
      const converted = await tx.evaluationProgram.update({
        where: { id },
        data: {
          status: 'CONVERTED',
          converted_order_id: orderId,
          converted_at: now,
          expired_at: now,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'evaluation_program.converted',
          tenant_id: program.tenant_id,
          actor,
          payload: JSON.stringify({ programId: id, orderId }),
          idempotency_key: `evaluation-program-converted-${id}`,
        },
      });
      return converted;
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processDuePrograms() {
    const now = new Date();
    const [dueActivation, dueExpiry] = await Promise.all([
      this.prisma.evaluationProgram.findMany({
        where: {
          status: 'APPROVED',
          starts_at: { lte: now },
          ends_at: { gt: now },
        },
        select: { id: true },
        take: 100,
      }),
      this.prisma.evaluationProgram.findMany({
        where: {
          status: {
            in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE'],
          },
          ends_at: { lte: now },
        },
        select: { id: true },
        take: 100,
      }),
    ]);
    const results = await Promise.allSettled([
      ...dueActivation.map((program) =>
        this.activateProgram(program.id, 'system:evaluation-program-scheduler'),
      ),
      ...dueExpiry.map((program) => this.expireProgram(program.id)),
    ]);
    const failures = results.filter((result) => result.status === 'rejected');
    for (const failure of failures) {
      if (failure.status === 'rejected') {
        this.logger.error(
          `Evaluation lifecycle action failed: ${
            failure.reason instanceof Error
              ? failure.reason.message
              : String(failure.reason)
          }`,
        );
      }
    }
    return {
      activationCandidates: dueActivation.length,
      expiryCandidates: dueExpiry.length,
      succeeded: results.length - failures.length,
      failed: failures.length,
    };
  }
}
