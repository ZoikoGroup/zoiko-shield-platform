import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { PrincipalService } from '../identity-adapter/principal.service';
import { SessionService } from '../identity-adapter/session.service';

const PARTNER_TYPES = [
  'REFERRAL',
  'RESELLER',
  'MSP',
  'MSSP',
  'CONSULTANCY',
  'AUDITOR',
  'TECHNOLOGY_PARTNER',
  'IR_SPECIALIST',
] as const;

export class CreatePartnerDto {
  @IsString()
  legalName!: string;

  @IsIn(PARTNER_TYPES)
  partnerType!: (typeof PARTNER_TYPES)[number];

  @IsString()
  @IsNotEmpty()
  managingOrganizationId!: string;
}

export class CreatePartnerAgreementDto {
  @IsString()
  partnerId!: string;

  @IsOptional()
  @IsNumber()
  commissionPercent?: number;

  @IsOptional()
  @IsNumber()
  marginPercent?: number;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  invoiceResponsibility?: string;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  taxResponsibility?: string;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  supportResponsibility?: string;

  @IsOptional()
  @IsIn(['ZOIKOSHIELD', 'PARTNER'])
  renewalRights?: string;
}

export class CreatePartnerPrincipalContextDto {
  @IsString()
  @IsNotEmpty()
  principalId!: string;
}

export class DeactivatePartnerPrincipalContextDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** ZS-COM-BILL-001 Part 21: partner economic terms require an approved agreement, fail-closed like everything else. */
@Injectable()
export class PartnerService {
  private readonly logger = new Logger(PartnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly principalService: PrincipalService,
    private readonly sessionService: SessionService,
  ) {}

  async createPartner(dto: CreatePartnerDto) {
    return this.prisma.partner.create({
      data: {
        legal_name: dto.legalName,
        partner_type: dto.partnerType,
        managing_organization_id: dto.managingOrganizationId,
        status: 'ACTIVE',
      },
    });
  }

  async createAgreement(dto: CreatePartnerAgreementDto) {
    return this.prisma.partnerAgreement.create({
      data: {
        partner_id: dto.partnerId,
        commission_percent: dto.commissionPercent ?? 0,
        margin_percent: dto.marginPercent ?? 0,
        invoice_responsibility: dto.invoiceResponsibility || 'ZOIKOSHIELD',
        tax_responsibility: dto.taxResponsibility || 'ZOIKOSHIELD',
        support_responsibility: dto.supportResponsibility || 'ZOIKOSHIELD',
        renewal_rights: dto.renewalRights || 'ZOIKOSHIELD',
        status: 'DRAFT',
      },
    });
  }

  async createPrincipalContext(
    partnerId: string,
    actorId: string,
    dto: CreatePartnerPrincipalContextDto,
  ) {
    const [partner, principal] = await Promise.all([
      this.prisma.partner.findFirst({
        where: {
          id: partnerId,
          status: 'ACTIVE',
          partner_type: { in: ['MSP', 'MSSP'] },
        },
      }),
      this.principalService.findById(dto.principalId),
    ]);
    if (!partner) {
      throw new NotFoundException(
        `Active MSP/MSSP partner '${partnerId}' not found`,
      );
    }
    if (!principal || principal.status !== 'ACTIVE') {
      throw new NotFoundException(
        `Active identity principal '${dto.principalId}' not found`,
      );
    }

    const existing = await this.prisma.partnerPrincipalContext.findUnique({
      where: { principal_id: dto.principalId },
    });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        error: 'PARTNER_PRINCIPAL_ALREADY_BOUND',
        message:
          existing.partner_id === partnerId
            ? 'This principal already has a partner identity context'
            : 'A principal cannot operate for more than one managing organization',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const context = await tx.partnerPrincipalContext.create({
        data: {
          partner_id: partner.id,
          principal_id: dto.principalId,
          managing_organization_id: partner.managing_organization_id,
          status: 'ACTIVE',
          created_by: actorId,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'partner_principal_context.created',
          actor: actorId,
          idempotency_key: `partner-principal-context-created-${context.id}`,
          payload: JSON.stringify({
            contextId: context.id,
            partnerId: partner.id,
            principalId: dto.principalId,
            managingOrganizationId: partner.managing_organization_id,
          }),
        },
      });
      return context;
    });
  }

  async listPrincipalContexts(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) {
      throw new NotFoundException(`Partner '${partnerId}' not found`);
    }
    return this.prisma.partnerPrincipalContext.findMany({
      where: { partner_id: partnerId },
      orderBy: { created_at: 'desc' },
    });
  }

  async deactivatePrincipalContext(
    partnerId: string,
    contextId: string,
    actorId: string,
    reason: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const context = await tx.partnerPrincipalContext.findFirst({
        where: { id: contextId, partner_id: partnerId },
      });
      if (!context) {
        throw new NotFoundException(
          `Partner principal context '${contextId}' not found`,
        );
      }
      if (context.status !== 'ACTIVE') {
        throw new ConflictException(
          `Partner principal context '${contextId}' is '${context.status}', not ACTIVE`,
        );
      }
      const activeDelegations = await tx.partnerDelegation.findMany({
        where: {
          partner_principal_context_id: context.id,
          status: 'ACTIVE',
        },
        select: { id: true, tenant_id: true },
      });
      const now = new Date();
      await tx.partnerDelegation.updateMany({
        where: {
          partner_principal_context_id: context.id,
          status: 'ACTIVE',
        },
        data: {
          status: 'REVOKED',
          revoked_by: actorId,
          revoked_at: now,
          revocation_reason: 'PARTNER_PRINCIPAL_CONTEXT_DEACTIVATED',
        },
      });
      const updated = await tx.partnerPrincipalContext.update({
        where: { id: context.id },
        data: {
          status: 'INACTIVE',
          deactivated_by: actorId,
          deactivated_at: now,
          deactivation_reason: reason,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'partner_principal_context.deactivated',
          actor: actorId,
          idempotency_key: `partner-principal-context-deactivated-${context.id}`,
          payload: JSON.stringify({
            contextId: context.id,
            partnerId,
            principalId: context.principal_id,
            reason,
            revokedDelegationIds: activeDelegations.map(
              (delegation) => delegation.id,
            ),
          }),
        },
      });
      return { context: updated, activeDelegations };
    });

    // The policy decision layer already denies the inactive context. Session
    // revocation removes any cached authority and refresh-token family too.
    await this.sessionService.revokeAllForPrincipal(
      result.context.principal_id,
      'PARTNER_PRINCIPAL_CONTEXT_DEACTIVATED',
    );
    return result.context;
  }

  async approveAgreement(id: string, approvedBy: string) {
    const agreement = await this.prisma.partnerAgreement.findUnique({
      where: { id },
    });
    if (!agreement) {
      throw new NotFoundException(`Partner agreement '${id}' not found`);
    }
    if (agreement.status !== 'DRAFT') {
      throw new ConflictException(
        `Partner agreement '${id}' is '${agreement.status}', not DRAFT`,
      );
    }
    return this.prisma.partnerAgreement.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });
  }

  async getActiveAgreement(partnerId: string) {
    const now = new Date();
    const agreement = await this.prisma.partnerAgreement.findFirst({
      where: {
        partner_id: partnerId,
        status: 'APPROVED',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      orderBy: { created_at: 'desc' },
    });
    if (!agreement) {
      this.logger.warn(
        `Partner agreement query FAILED CLOSED for partner '${partnerId}'`,
      );
    }
    return agreement;
  }
}
