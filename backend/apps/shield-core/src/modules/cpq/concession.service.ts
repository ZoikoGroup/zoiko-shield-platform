import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialApprovalService } from '../approvals/commercial-approval.service';

const OFFER_TYPES = [
  'MANAGED_DEFENSE',
  'CONTINUOUS_ASSURANCE',
  'EXPOSURE_MANAGEMENT',
  'AI_SECURITY',
] as const;

export class RequestConcessionDto {
  @IsUUID()
  subscriptionId!: string;

  @IsString()
  tenantId!: string;

  @IsString()
  environmentId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(OFFER_TYPES, { each: true })
  offerTypes!: string[];

  @IsISO8601()
  startsAt!: Date;

  @IsISO8601()
  endsAt!: Date;

  @IsString()
  commercialReason!: string;

  @IsNumber()
  @Min(0)
  marginImpact!: number;

  @IsIn(['EXPIRE', 'CONVERT_TO_PAID', 'REVIEW_AT_RENEWAL'])
  renewalTreatment!: 'EXPIRE' | 'CONVERT_TO_PAID' | 'REVIEW_AT_RENEWAL';
}

export class DecideConcessionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

@Injectable()
export class ConcessionService {
  private readonly logger = new Logger(ConcessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: CommercialApprovalService,
  ) {}

  async getConcession(id: string) {
    const concession = await this.prisma.commercialConcession.findUnique({
      where: { id },
      include: { entitlements: true, subscription: true },
    });
    if (!concession) {
      throw new NotFoundException(`Commercial concession '${id}' not found`);
    }
    return concession;
  }

  async listConcessions(
    filters: {
      tenantId?: string;
      environmentId?: string;
      status?: string;
    } = {},
  ) {
    return this.prisma.commercialConcession.findMany({
      where: {
        ...(filters.tenantId ? { tenant_id: filters.tenantId } : {}),
        ...(filters.environmentId
          ? { environment_id: filters.environmentId }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
  }

  private async requireBinding(
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
      throw new ConflictException(
        'Concession requires an exact active commercial-account tenant/environment binding',
      );
    }
    return binding;
  }

  async requestConcession(dto: RequestConcessionDto, requestedBy: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt || endsAt <= new Date()) {
      throw new BadRequestException(
        'A concession requires a future hard end later than its start',
      );
    }
    if (startsAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException(
        'Concession startsAt cannot be in the past',
      );
    }
    if (!dto.commercialReason.trim()) {
      throw new BadRequestException('commercialReason must not be empty');
    }
    const subscription = await this.prisma.commercialSubscription.findUnique({
      where: { id: dto.subscriptionId },
    });
    if (!subscription || subscription.status !== 'ACTIVE') {
      throw new ConflictException('Concessions require an ACTIVE subscription');
    }
    await this.requireBinding(
      subscription.commercial_account_id,
      dto.tenantId,
      dto.environmentId,
    );
    const offerTypes = [...new Set(dto.offerTypes)];

    return this.prisma.$transaction(async (tx) => {
      const concession = await tx.commercialConcession.create({
        data: {
          subscription_id: subscription.id,
          commercial_account_id: subscription.commercial_account_id,
          tenant_id: dto.tenantId,
          environment_id: dto.environmentId,
          scope: JSON.stringify(offerTypes),
          starts_at: startsAt,
          ends_at: endsAt,
          commercial_reason: dto.commercialReason,
          margin_impact: dto.marginImpact,
          renewal_treatment: dto.renewalTreatment,
          status: 'PENDING_APPROVAL',
          requested_by: requestedBy,
        },
      });
      const approval = await this.approvals.requestApproval(
        {
          changeType: 'FREE_MONTHS',
          objectType: 'CommercialConcession',
          objectId: concession.id,
          tenantId: dto.tenantId,
          requestedBy,
          reason: dto.commercialReason,
          beforeSnapshot: { concession: null },
          proposedSnapshot: {
            subscriptionId: subscription.id,
            offerTypes,
            startsAt,
            endsAt,
            marginImpact: dto.marginImpact,
            renewalTreatment: dto.renewalTreatment,
          },
          marginImpact: dto.marginImpact,
          requiredApprovalRole: 'FINANCE_COMMERCIAL_APPROVER',
          expiresAt: endsAt,
        },
        tx,
      );
      return tx.commercialConcession.update({
        where: { id: concession.id },
        data: { approval_id: approval.id },
      });
    });
  }

  async decideConcession(
    id: string,
    approverId: string,
    dto: DecideConcessionDto,
  ) {
    const concession = await this.getConcession(id);
    if (concession.status !== 'PENDING_APPROVAL' || !concession.approval_id) {
      throw new ConflictException('Concession has no pending linked approval');
    }
    await this.approvals.decideApproval(
      concession.approval_id,
      approverId,
      dto.decision,
      dto.reason,
    );
    return this.prisma.commercialConcession.update({
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
  }

  async activateConcession(id: string, actor: string) {
    const concession = await this.getConcession(id);
    const now = new Date();
    if (concession.status !== 'APPROVED' || !concession.approval_id) {
      throw new ConflictException('Only an APPROVED concession can activate');
    }
    if (concession.subscription.status !== 'ACTIVE') {
      throw new ConflictException(
        'Concession subscription is no longer ACTIVE',
      );
    }
    if (concession.starts_at > now || concession.ends_at <= now) {
      throw new ConflictException(
        'Concession is outside its approved time window',
      );
    }
    const approval = await this.approvals.getApprovalById(
      concession.approval_id,
    );
    if (
      approval.status !== 'APPROVED' ||
      approval.object_type !== 'CommercialConcession' ||
      approval.object_id !== id
    ) {
      throw new ConflictException('Concession approval is not valid');
    }
    await this.requireBinding(
      concession.commercial_account_id,
      concession.tenant_id,
      concession.environment_id,
    );
    const account = await this.prisma.commercialAccount.findUnique({
      where: { id: concession.commercial_account_id },
    });
    if (!account || account.status !== 'ACTIVE') {
      throw new ConflictException(
        'Concession commercial account is not ACTIVE',
      );
    }
    const offers = JSON.parse(concession.scope) as string[];
    const collision = await this.prisma.entitlement.findFirst({
      where: {
        tenant_id: concession.tenant_id,
        offer_type: { in: offers },
        status: 'ACTIVE',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
    });
    if (collision) {
      throw new ConflictException(
        `Tenant already has ACTIVE '${collision.offer_type}' scope; concession would duplicate it`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.entitlement.createMany({
        data: offers.map((offerType) => ({
          commercial_account_id: concession.commercial_account_id,
          tenant_id: concession.tenant_id,
          offer_type: offerType,
          source_type: 'COMMERCIAL_CONCESSION',
          source_id: concession.id,
          concession_id: concession.id,
          status: 'ACTIVE',
          effective_from: concession.starts_at,
          effective_to: concession.ends_at,
        })),
      });
      const active = await tx.commercialConcession.update({
        where: { id },
        data: { status: 'ACTIVE', activated_at: now },
      });
      await tx.commercialApproval.update({
        where: { id: approval.id },
        data: { status: 'APPLIED', applied_at: now },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'commercial_concession.activated',
          tenant_id: concession.tenant_id,
          actor,
          payload: JSON.stringify({
            concessionId: id,
            offers,
            endsAt: concession.ends_at,
            renewalTreatment: concession.renewal_treatment,
          }),
          idempotency_key: `commercial-concession-activated-${id}`,
        },
      });
      return active;
    });
  }

  async expireConcession(
    id: string,
    actor = 'system:commercial-concession-scheduler',
  ) {
    const concession = await this.getConcession(id);
    if (
      !['PENDING_APPROVAL', 'APPROVED', 'ACTIVE'].includes(concession.status)
    ) {
      throw new ConflictException(
        `Concession '${id}' is already terminal in ${concession.status}`,
      );
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.entitlement.updateMany({
        where: { concession_id: id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', effective_to: now },
      });
      const expired = await tx.commercialConcession.update({
        where: { id },
        data: { status: 'EXPIRED', expired_at: now },
      });
      if (concession.status === 'PENDING_APPROVAL' && concession.approval_id) {
        await tx.commercialApproval.update({
          where: { id: concession.approval_id },
          data: { status: 'EXPIRED' },
        });
      }
      // B6: enforce renewal treatment on expiry
      const eventType =
        concession.renewal_treatment === 'CONVERT_TO_PAID'
          ? 'commercial_concession.conversion_required'
          : 'commercial_concession.expired';
      await tx.commercialEvent.create({
        data: {
          event_type: eventType,
          tenant_id: concession.tenant_id,
          actor,
          payload: JSON.stringify({
            concessionId: id,
            renewalTreatment: concession.renewal_treatment,
            entitlementAction: 'EXPIRE',
            ...(concession.renewal_treatment === 'CONVERT_TO_PAID'
              ? {
                  conversionRequired: true,
                  subscriptionId: concession.subscription_id,
                  commercialAccountId: concession.commercial_account_id,
                  scope: JSON.parse(concession.scope),
                }
              : {}),
          }),
          idempotency_key: `commercial-concession-expired-${id}`,
        },
      });
      return expired;
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processConcessionLifecycle() {
    const now = new Date();
    const [dueActivation, dueExpiry] = await Promise.all([
      this.prisma.commercialConcession.findMany({
        where: {
          status: 'APPROVED',
          starts_at: { lte: now },
          ends_at: { gt: now },
        },
        select: { id: true },
        take: 100,
      }),
      this.prisma.commercialConcession.findMany({
        where: {
          status: { in: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE'] },
          ends_at: { lte: now },
        },
        select: { id: true },
        take: 100,
      }),
    ]);
    const results = await Promise.allSettled([
      ...dueActivation.map((item) =>
        this.activateConcession(
          item.id,
          'system:commercial-concession-scheduler',
        ),
      ),
      ...dueExpiry.map((item) => this.expireConcession(item.id)),
    ]);
    const failures = results.filter((result) => result.status === 'rejected');
    failures.forEach((failure) => {
      if (failure.status === 'rejected') {
        this.logger.error(
          `Concession lifecycle action failed: ${
            failure.reason instanceof Error
              ? failure.reason.message
              : String(failure.reason)
          }`,
        );
      }
    });
    return {
      activationCandidates: dueActivation.length,
      expiryCandidates: dueExpiry.length,
      succeeded: results.length - failures.length,
      failed: failures.length,
    };
  }
}
