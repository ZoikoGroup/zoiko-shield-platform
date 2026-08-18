import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { assertTransition } from '../commerce/state-machine.util';

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

  @IsIn(['SOC_COVERAGE', 'ASSURANCE_REVIEW', 'IR_RETAINER', 'VCISO'])
  obligationType!:
    'SOC_COVERAGE' | 'ASSURANCE_REVIEW' | 'IR_RETAINER' | 'VCISO';

  @IsOptional()
  @IsIn(['BUSINESS_HOURS', 'EXTENDED', '24x7'])
  coverageWindow?: 'BUSINESS_HOURS' | 'EXTENDED' | '24x7';

  @IsOptional()
  @IsISO8601()
  dueAt?: Date;
}

@Injectable()
export class ServiceObligationService {
  private readonly logger = new Logger(ServiceObligationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new service obligation under a contract
   */
  async createObligation(dto: CreateServiceObligationDto) {
    this.logger.log(
      `Creating ${dto.obligationType} obligation for contract ${dto.contractId}`,
    );

    return this.prisma.serviceObligation.create({
      data: {
        contract_id: dto.contractId,
        obligation_type: dto.obligationType,
        coverage_window: dto.coverageWindow || 'BUSINESS_HOURS',
        status: 'NOT_DUE',
        due_at: dto.dueAt,
      },
    });
  }

  /**
   * Get obligations by contract ID
   */
  async getObligationsByContract(contractId: string) {
    return this.prisma.serviceObligation.findMany({
      where: { contract_id: contractId },
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
  ) {
    const existing = await this.prisma.serviceObligation.findUnique({
      where: { id: obligationId },
    });

    if (!existing) {
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

    const data: any = { status };
    if (status === 'DELIVERED') data.delivered_at = new Date();
    if (evidenceRef) data.evidence_ref = evidenceRef;

    return this.prisma.serviceObligation.update({
      where: { id: obligationId },
      data,
    });
  }
}
