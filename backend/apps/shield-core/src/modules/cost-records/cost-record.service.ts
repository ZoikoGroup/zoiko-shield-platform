import { Injectable, Logger } from '@nestjs/common';
import { IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class RecordCostDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  usageClass!: string;

  @IsString()
  provider!: string;

  @IsISO8601()
  periodStart!: Date;

  @IsISO8601()
  periodEnd!: Date;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitCost!: number;

  @IsString()
  allocationMethod!: string;

  @IsString()
  source!: string;
}

/**
 * ZS-COM-BILL-001 Part 26: internal unit economics only. Never
 * automatically exposed as customer price — read by margin-analysis
 * tooling and approval gating, not by anything customer-facing.
 */
@Injectable()
export class CostRecordService {
  private readonly logger = new Logger(CostRecordService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordCost(dto: RecordCostDto) {
    return this.prisma.costRecord.create({
      data: {
        tenant_id: dto.tenantId,
        usage_class: dto.usageClass,
        provider: dto.provider,
        period_start: dto.periodStart,
        period_end: dto.periodEnd,
        quantity: dto.quantity,
        unit_cost: dto.unitCost,
        total_cost: dto.quantity * dto.unitCost,
        allocation_method: dto.allocationMethod,
        source: dto.source,
      },
    });
  }

  async getCostsByTenant(
    tenantId: string,
    periodStart?: Date,
    periodEnd?: Date,
  ) {
    return this.prisma.costRecord.findMany({
      where: {
        tenant_id: tenantId,
        ...(periodStart && periodEnd
          ? {
              period_start: { gte: periodStart },
              period_end: { lte: periodEnd },
            }
          : {}),
      },
      orderBy: { period_start: 'desc' },
    });
  }

  async getTotalCostByUsageClass(
    usageClass: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const records = await this.prisma.costRecord.findMany({
      where: {
        usage_class: usageClass,
        period_start: { gte: periodStart },
        period_end: { lte: periodEnd },
      },
    });
    return records.reduce((sum, r) => sum + Number(r.total_cost), 0);
  }
}
