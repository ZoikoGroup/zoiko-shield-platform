import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { SlaDefinitionService } from './sla-definition.service';

export class RecordMeasurementDto {
  @IsString()
  slaKey!: string;

  @IsUUID()
  contractId!: string;

  @IsISO8601()
  periodStart!: Date;

  @IsISO8601()
  periodEnd!: Date;

  @IsNumber()
  measuredValue!: number;

  @IsOptional()
  @IsString()
  evidenceRef?: string;

  @IsOptional()
  @IsString()
  measurementSource?: string;
}

/**
 * Breach is derived purely from the approved definition's comparison rule
 * — never asserted by the caller — so a measurement can't be filed as
 * "breached" (or not) by whoever happens to be recording it.
 */
@Injectable()
export class SlaMeasurementService {
  private readonly logger = new Logger(SlaMeasurementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly definitionService: SlaDefinitionService,
  ) {}

  private async assertContractTenant(tenantId: string, contractId: string): Promise<void> {
    const contract = await this.prisma.contract.findFirst({
      where: {
        id: contractId,
        commercialAccount: { entitlements: { some: { tenant_id: tenantId } } },
      },
      select: { id: true },
    });
    if (!contract) {
      throw new NotFoundException(`Contract '${contractId}' not found`);
    }
  }

  async recordMeasurement(tenantId: string, dto: RecordMeasurementDto) {
    await this.assertContractTenant(tenantId, dto.contractId);
    const definition = await this.definitionService.getActiveDefinition(dto.slaKey);
    if (!definition) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_SLA_DEFINITION',
        message: `No approved SLA definition for key '${dto.slaKey}'`,
      });
    }

    const target = Number(definition.target_value);
    const breached =
      definition.comparison === 'MIN' ? dto.measuredValue < target : dto.measuredValue > target;

    return this.prisma.slaMeasurement.create({
      data: {
        sla_definition_id: definition.id,
        contract_id: dto.contractId,
        period_start: dto.periodStart,
        period_end: dto.periodEnd,
        measured_value: dto.measuredValue,
        breached,
        evidence_ref: dto.evidenceRef,
        measurement_source: dto.measurementSource || 'SYSTEM',
      },
    });
  }

  async getMeasurementById(tenantId: string, id: string) {
    const measurement = await this.prisma.slaMeasurement.findUnique({
      where: { id },
      include: { slaDefinition: true },
    });
    if (!measurement) {
      throw new NotFoundException(`SLA measurement '${id}' not found`);
    }
    await this.assertContractTenant(tenantId, measurement.contract_id);
    return measurement;
  }
}
