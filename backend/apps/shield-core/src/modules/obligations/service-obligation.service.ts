import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateServiceObligationDto {
  contractId!: string;
  obligationType!: 'SOC_COVERAGE' | 'ASSURANCE_REVIEW' | 'IR_RETAINER' | 'VCISO';
  coverageWindow?: 'BUSINESS_HOURS' | 'EXTENDED' | '24x7';
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
    this.logger.log(`Creating ${dto.obligationType} obligation for contract ${dto.contractId}`);

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
  async updateStatus(obligationId: string, status: string, evidenceRef?: string) {
    const existing = await this.prisma.serviceObligation.findUnique({
      where: { id: obligationId },
    });

    if (!existing) {
      throw new NotFoundException(`Service obligation '${obligationId}' not found`);
    }

    const data: any = { status };
    if (status === 'DELIVERED') data.delivered_at = new Date();
    if (evidenceRef) data.evidence_ref = evidenceRef;

    return this.prisma.serviceObligation.update({
      where: { id: obligationId },
      data,
    });
  }
}
