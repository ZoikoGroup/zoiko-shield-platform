import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerDelegationService } from './partner-delegation.service';
import type { DelegationScope } from './partner-delegation.service';

const SUPPORT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const SUPPORT_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;

const SUPPORT_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'CLOSED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};

export class CreatePartnerSupportCaseDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: (typeof SUPPORT_PRIORITIES)[number];
}

export class UpdatePartnerSupportCaseDto {
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: (typeof SUPPORT_STATUSES)[number];

  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: (typeof SUPPORT_PRIORITIES)[number];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;
}

interface PartnerOperationBoundary {
  tenantId: string;
  environmentId: string | null;
  principalId: string;
  managingOrganizationId: string;
  commercialAccountId: string;
}

@Injectable()
export class PartnerOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationService: PartnerDelegationService,
  ) {}

  async getUsage(boundary: PartnerOperationBoundary) {
    await this.authorize(boundary, 'VIEW_USAGE');
    return this.prisma.usageRecord.findMany({
      where: {
        tenant_id: boundary.tenantId,
        environment_id: this.requireEnvironment(boundary.environmentId),
      },
      orderBy: { recorded_at: 'desc' },
    });
  }

  async getInvoices(boundary: PartnerOperationBoundary) {
    await this.authorize(boundary, 'VIEW_INVOICES');
    return this.prisma.commercialInvoice.findMany({
      where: { commercial_account_id: boundary.commercialAccountId },
      include: { lines: true, creditNotes: true, debitNotes: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async getEntitlements(boundary: PartnerOperationBoundary) {
    await this.authorize(boundary, 'VIEW_ENTITLEMENTS');
    return this.prisma.entitlement.findMany({
      where: {
        commercial_account_id: boundary.commercialAccountId,
        tenant_id: boundary.tenantId,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async listSupportCases(boundary: PartnerOperationBoundary) {
    await this.authorize(boundary, 'VIEW_TICKETS');
    return this.prisma.partnerSupportCase.findMany({
      where: this.supportBoundary(boundary),
      orderBy: { created_at: 'desc' },
    });
  }

  async createSupportCase(
    boundary: PartnerOperationBoundary,
    dto: CreatePartnerSupportCaseDto,
  ) {
    const delegation = await this.authorize(boundary, 'MANAGE_SUPPORT_CASES');
    return this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.partnerSupportCase.create({
        data: {
          commercial_account_id: boundary.commercialAccountId,
          tenant_id: boundary.tenantId,
          environment_id: this.requireEnvironment(boundary.environmentId),
          subject: dto.subject,
          description: dto.description,
          priority: dto.priority ?? 'NORMAL',
          status: 'OPEN',
          created_by: boundary.principalId,
          created_via_delegation_id: delegation.id,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'partner_support_case.created',
          tenant_id: boundary.tenantId,
          actor: boundary.principalId,
          idempotency_key: `partner-support-case-created-${supportCase.id}`,
          payload: JSON.stringify({
            supportCaseId: supportCase.id,
            commercialAccountId: boundary.commercialAccountId,
            environmentId: boundary.environmentId,
            delegationId: delegation.id,
          }),
        },
      });
      return supportCase;
    });
  }

  async updateSupportCase(
    boundary: PartnerOperationBoundary,
    supportCaseId: string,
    dto: UpdatePartnerSupportCaseDto,
  ) {
    const delegation = await this.authorize(boundary, 'MANAGE_SUPPORT_CASES');
    if (!dto.status && !dto.priority && !dto.description) {
      throw new BadRequestException(
        'At least one support-case change is required',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const supportCase = await tx.partnerSupportCase.findFirst({
        where: { id: supportCaseId, ...this.supportBoundary(boundary) },
      });
      if (!supportCase) {
        throw new NotFoundException(
          `Partner support case '${supportCaseId}' not found`,
        );
      }
      if (
        dto.status &&
        dto.status !== supportCase.status &&
        !SUPPORT_TRANSITIONS[supportCase.status]?.includes(dto.status)
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'INVALID_SUPPORT_CASE_TRANSITION',
          message: `Support case cannot transition from '${supportCase.status}' to '${dto.status}'`,
        });
      }
      const updated = await tx.partnerSupportCase.update({
        where: { id: supportCase.id },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.description ? { description: dto.description } : {}),
          updated_by: boundary.principalId,
        },
      });
      await tx.commercialEvent.create({
        data: {
          event_type: 'partner_support_case.updated',
          tenant_id: boundary.tenantId,
          actor: boundary.principalId,
          idempotency_key: `partner-support-case-updated-${supportCase.id}-${updated.updated_at.toISOString()}`,
          payload: JSON.stringify({
            supportCaseId: supportCase.id,
            previousStatus: supportCase.status,
            status: updated.status,
            priority: updated.priority,
            delegationId: delegation.id,
          }),
        },
      });
      return updated;
    });
  }

  private authorize(
    boundary: PartnerOperationBoundary,
    requiredScope: DelegationScope,
  ) {
    return this.delegationService.requireActiveDelegation({
      tenantId: boundary.tenantId,
      environmentId: boundary.environmentId,
      partnerPrincipalId: boundary.principalId,
      managingOrganizationId: boundary.managingOrganizationId,
      commercialAccountId: boundary.commercialAccountId,
      requiredScope,
    });
  }

  private supportBoundary(boundary: PartnerOperationBoundary) {
    return {
      commercial_account_id: boundary.commercialAccountId,
      tenant_id: boundary.tenantId,
      environment_id: this.requireEnvironment(boundary.environmentId),
    };
  }

  private requireEnvironment(environmentId: string | null): string {
    if (!environmentId) {
      throw new BadRequestException(
        'An environment-bound session is required for partner operations',
      );
    }
    return environmentId;
  }
}
