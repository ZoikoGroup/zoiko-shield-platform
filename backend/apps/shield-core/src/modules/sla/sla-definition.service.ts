import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateSlaDefinitionDto {
  @IsString()
  slaKey!: string;

  @IsString()
  metric!: string;

  @IsIn(['MIN', 'MAX'])
  comparison!: 'MIN' | 'MAX';

  @IsNumber()
  targetValue!: number;

  @IsOptional()
  @IsString()
  serviceTier?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  measurementWindow?: string;

  /** e.g. [{ "breachPercent": 1, "creditPercent": 5 }, { "breachPercent": 5, "creditPercent": 25 }] */
  @IsOptional()
  creditFormula?: Array<{ breachPercent: number; creditPercent: number }>;

  @IsOptional()
  @IsInt()
  @IsPositive()
  disputeWindowDays?: number;
}

/**
 * ZS-COM-BILL-001 SVC-04: no broad contractual SLA/credit promise without
 * an approved, versioned definition — same fail-closed pattern used
 * throughout the commercial plane.
 */
@Injectable()
export class SlaDefinitionService {
  private readonly logger = new Logger(SlaDefinitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createDefinition(dto: CreateSlaDefinitionDto) {
    const latest = await this.prisma.slaDefinition.findFirst({
      where: { sla_key: dto.slaKey },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.slaDefinition.create({
      data: {
        sla_key: dto.slaKey,
        version,
        metric: dto.metric,
        comparison: dto.comparison,
        target_value: dto.targetValue,
        service_tier: dto.serviceTier || 'STANDARD',
        region: dto.region || 'GLOBAL',
        measurement_window: dto.measurementWindow || 'MONTHLY',
        credit_formula: JSON.stringify(dto.creditFormula || []),
        dispute_window_days: dto.disputeWindowDays ?? 30,
        status: 'DRAFT',
      },
    });
  }

  async approveDefinition(id: string, approvedBy: string) {
    const definition = await this.prisma.slaDefinition.findUnique({ where: { id } });
    if (!definition) {
      throw new NotFoundException(`SLA definition '${id}' not found`);
    }
    if (definition.status !== 'DRAFT') {
      throw new ConflictException(`SLA definition '${id}' is '${definition.status}', not DRAFT`);
    }

    return this.prisma.slaDefinition.update({
      where: { id },
      data: { status: 'APPROVED', approved_by: approvedBy, approved_at: new Date() },
    });
  }

  async getActiveDefinition(slaKey: string) {
    const now = new Date();
    const definition = await this.prisma.slaDefinition.findFirst({
      where: {
        sla_key: slaKey,
        status: 'APPROVED',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      orderBy: { version: 'desc' },
    });

    if (!definition) {
      this.logger.warn(`SLA definition query FAILED CLOSED for key '${slaKey}'`);
      return null;
    }
    return definition;
  }
}
