import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { assertTransition } from '../commerce/state-machine.util';
import { ManagedDefenseService } from '../managed-defense/managed-defense.service';

/** ZS-COM-BILL-001 Part 14 obligation lifecycle. */
const OBLIGATION_TRANSITIONS: Record<string, string[]> = {
  NOT_DUE: ['PLANNED', 'CANCELLED'],
  PLANNED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ACTIVE', 'CUSTOMER_BLOCKED', 'CANCELLED'],
  ACTIVE: ['CUSTOMER_BLOCKED', 'DELIVERED', 'BREACHED', 'WAIVED'],
  CUSTOMER_BLOCKED: ['ACTIVE', 'WAIVED', 'CANCELLED'],
  DELIVERED: [],
  BREACHED: ['WAIVED'],
  WAIVED: [],
  CANCELLED: [],
};

export class CreateServiceObligationDto {
  @IsUUID()
  contractId!: string;

  @IsIn([
    'SOC_COVERAGE',
    'ASSURANCE_REVIEW',
    'IR_RETAINER',
    'VCISO',
    'ASSESSMENT_PROJECT',
    'TABLETOP_PROJECT',
    'PENETRATION_TEST',
    'AUDIT_EVIDENCE_PROJECT',
    'PROFESSIONAL_SERVICE',
  ])
  obligationType!:
    | 'SOC_COVERAGE'
    | 'ASSURANCE_REVIEW'
    | 'IR_RETAINER'
    | 'VCISO'
    | 'ASSESSMENT_PROJECT'
    | 'TABLETOP_PROJECT'
    | 'PENETRATION_TEST'
    | 'AUDIT_EVIDENCE_PROJECT'
    | 'PROFESSIONAL_SERVICE';

  @IsOptional()
  @IsUUID()
  managedDefenseProfileId?: string;

  @IsOptional()
  @IsString()
  obligationKey?: string;

  @IsOptional()
  @IsObject()
  obligationScope?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['BUSINESS_HOURS', 'EXTENDED', '24X7', '24x7'])
  coverageWindow?: 'BUSINESS_HOURS' | 'EXTENDED' | '24X7' | '24x7';

  @IsOptional()
  @IsISO8601()
  dueAt?: Date;
}

@Injectable()
export class ServiceObligationService {
  private readonly logger = new Logger(ServiceObligationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly managedDefense: ManagedDefenseService,
  ) {}

  /**
   * Register a new service obligation under a contract
   */
  async createObligation(
    dto: CreateServiceObligationDto,
    tenantId?: string,
    environmentId?: string,
  ) {
    this.logger.log(
      `Creating ${dto.obligationType} obligation for contract ${dto.contractId}`,
    );

    let profile = null;
    if (dto.obligationType === 'SOC_COVERAGE') {
      if (!dto.managedDefenseProfileId || !tenantId || !environmentId) {
        throw new ConflictException(
          'SOC_COVERAGE requires a tenant-bound ACTIVE Managed Defense profile',
        );
      }
      profile = await this.managedDefense.getProfile(
        dto.managedDefenseProfileId,
        tenantId,
        environmentId,
      );
      if (
        profile.status !== 'ACTIVE' ||
        profile.contract_id !== dto.contractId ||
        profile.readiness?.status !== 'VERIFIED'
      ) {
        throw new ConflictException(
          'SOC_COVERAGE requires the matching readiness-verified ACTIVE profile',
        );
      }
      const requestedCoverage =
        dto.coverageWindow === '24x7' ? '24X7' : dto.coverageWindow;
      if (requestedCoverage && requestedCoverage !== profile.coverage_window) {
        throw new ConflictException(
          'Obligation coverageWindow cannot exceed or differ from the approved profile',
        );
      }
    }

    return this.prisma.serviceObligation.create({
      data: {
        tenant_id: tenantId,
        environment_id: environmentId,
        contract_id: dto.contractId,
        managed_defense_profile_id: profile?.id,
        obligation_key: dto.obligationKey?.trim(),
        obligation_type: dto.obligationType,
        obligation_scope: JSON.stringify(dto.obligationScope ?? {}),
        coverage_window:
          profile?.coverage_window ||
          (dto.coverageWindow === '24x7' ? '24X7' : dto.coverageWindow) ||
          'BUSINESS_HOURS',
        response_authority: profile?.response_authority || 'R0',
        customer_dependencies:
          profile?.customer_dependencies || JSON.stringify([]),
        exclusions: profile?.exclusions || JSON.stringify([]),
        status: 'NOT_DUE',
        due_at: dto.dueAt,
      },
    });
  }

  /**
   * Get obligations by contract ID
   */
  async getObligationsByContract(
    contractId: string,
    tenantId?: string,
    environmentId?: string,
  ) {
    if (tenantId && environmentId) {
      const contract = await this.prisma.contract.findFirst({
        where: {
          id: contractId,
          commercialAccount: {
            tenantBindings: {
              some: {
                tenant_id: tenantId,
                environment_id: environmentId,
                status: 'ACTIVE',
              },
            },
          },
        },
      });
      if (!contract) {
        throw new NotFoundException(`Contract '${contractId}' not found`);
      }
    }
    return this.prisma.serviceObligation.findMany({
      where: {
        contract_id: contractId,
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...(environmentId ? { environment_id: environmentId } : {}),
      },
      include: { deliveryEvents: true },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Update obligation delivery status and record evidence link
   */
  async updateStatus(
    obligationId: string,
    status: string,
    evidenceRef?: string,
    tenantId?: string,
    environmentId?: string,
    actorId = 'system:obligations',
  ) {
    const existing = await this.prisma.serviceObligation.findUnique({
      where: { id: obligationId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Service obligation '${obligationId}' not found`,
      );
    }
    if (
      tenantId &&
      (existing.tenant_id !== tenantId ||
        existing.environment_id !== environmentId)
    ) {
      throw new NotFoundException(
        `Service obligation '${obligationId}' not found`,
      );
    }

    assertTransition(
      OBLIGATION_TRANSITIONS,
      existing.status,
      status,
      'service obligation',
    );

    if (status === 'DELIVERED' && !evidenceRef?.trim()) {
      throw new ConflictException(
        'DELIVERED requires an immutable delivery evidence reference',
      );
    }
    const data: any = { status };
    if (status === 'DELIVERED') data.delivered_at = new Date();
    if (evidenceRef) data.evidence_ref = evidenceRef;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceObligation.update({
        where: { id: obligationId },
        data,
      });
      if (
        existing.managed_defense_profile_id &&
        existing.tenant_id &&
        existing.environment_id
      ) {
        await this.managedDefense.recordDelivery(
          existing.tenant_id,
          existing.environment_id,
          {
            managedDefenseProfileId: existing.managed_defense_profile_id,
            serviceObligationId: existing.id,
            eventType: 'OBLIGATION_STATUS',
            sourceReference: existing.id,
            evidenceReference:
              evidenceRef || `obligation-status:${existing.id}:${status}`,
            actorId,
            occurredAt: new Date(),
            details: { fromStatus: existing.status, toStatus: status },
          },
          tx,
        );
      }
      return updated;
    });
  }
}
