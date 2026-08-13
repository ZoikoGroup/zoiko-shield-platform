import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateMeterDefinitionDto {
  @IsString()
  meterKey!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsArray()
  sourceScope?: string[];

  @IsOptional()
  @IsIn(['DAILY', 'HOURLY', 'MONTHLY'])
  aggregationWindow?: string;

  @IsOptional()
  @IsIn(['SOURCE_EVENT_ID'])
  dedupePolicy?: string;

  @IsOptional()
  @IsInt()
  includedQuantity?: number;

  /** NEVER_BILLABLE forces every event on this meter to NON_BILLABLE regardless of state. */
  @IsOptional()
  @IsIn(['STANDARD', 'NEVER_BILLABLE'])
  billablePolicy?: string;
}

/**
 * ZS-COM-BILL-001 Part 7: a meter must be an approved, versioned
 * definition before any event can be classified against it — same
 * fail-closed pattern as the price book / catalog.
 */
@Injectable()
export class MeterDefinitionService {
  private readonly logger = new Logger(MeterDefinitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createDefinition(dto: CreateMeterDefinitionDto) {
    const latest = await this.prisma.meterDefinition.findFirst({
      where: { meter_key: dto.meterKey },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.meterDefinition.create({
      data: {
        meter_key: dto.meterKey,
        version,
        unit: dto.unit || 'EVENTS',
        source_scope: JSON.stringify(dto.sourceScope || []),
        aggregation_window: dto.aggregationWindow || 'DAILY',
        dedupe_policy: dto.dedupePolicy || 'SOURCE_EVENT_ID',
        included_quantity: dto.includedQuantity || 0,
        billable_policy: dto.billablePolicy || 'STANDARD',
        status: 'DRAFT',
      },
    });
  }

  async approveDefinition(id: string, approvedBy: string) {
    const definition = await this.prisma.meterDefinition.findUnique({
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException(`Meter definition '${id}' not found`);
    }
    if (definition.status !== 'DRAFT') {
      throw new ConflictException(
        `Meter definition '${id}' is '${definition.status}', not DRAFT`,
      );
    }

    return this.prisma.meterDefinition.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });
  }

  async getActiveDefinition(meterKey: string) {
    const now = new Date();
    const definition = await this.prisma.meterDefinition.findFirst({
      where: {
        meter_key: meterKey,
        status: 'APPROVED',
        effective_from: { lte: now },
        OR: [{ effective_to: null }, { effective_to: { gte: now } }],
      },
      orderBy: { version: 'desc' },
    });

    if (!definition) {
      this.logger.warn(
        `Meter definition query FAILED CLOSED for key '${meterKey}'`,
      );
      return null;
    }
    return definition;
  }
}
