import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateMeterDefinitionDto {
  @IsString()
  @IsNotEmpty()
  meterKey!: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  sourceScope!: string[];

  @IsObject()
  validationRules!: Record<string, unknown>;

  @IsOptional()
  @IsIn(['DAILY', 'HOURLY', 'MONTHLY'])
  aggregationWindow?: string;

  @IsOptional()
  @IsIn(['SOURCE_EVENT_ID'])
  dedupePolicy?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  includedQuantity?: number;

  /** NEVER_BILLABLE forces every event on this meter to NON_BILLABLE regardless of state. */
  @IsOptional()
  @IsIn(['STANDARD', 'NEVER_BILLABLE'])
  billablePolicy?: string;

  @IsOptional()
  @IsIn(['REVERSAL_REPLACEMENT_ADJUSTMENT', 'REVERSAL_ONLY'])
  correctionPolicy?: string;
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

  async createDefinition(dto: CreateMeterDefinitionDto, requestedBy: string) {
    const meterKey = dto.meterKey.trim();
    if (!meterKey || !dto.unit.trim()) {
      throw new ConflictException('meterKey and unit must be non-empty');
    }
    const sourceScope = [
      ...new Set(dto.sourceScope.map((source) => source.trim())),
    ];
    if (!sourceScope.length || sourceScope.some((source) => !source)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'METER_SOURCE_SCOPE_REQUIRED',
        message: 'A meter definition must have at least one non-empty source',
      });
    }
    if (!Object.keys(dto.validationRules).length) {
      throw new ConflictException({
        statusCode: 409,
        error: 'METER_VALIDATION_RULES_REQUIRED',
        message: 'A meter definition must declare visible validation rules',
      });
    }

    const latest = await this.prisma.meterDefinition.findFirst({
      where: { meter_key: meterKey },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    return this.prisma.meterDefinition.create({
      data: {
        meter_key: meterKey,
        version,
        unit: dto.unit.trim(),
        source_scope: JSON.stringify(sourceScope),
        validation_rules: JSON.stringify(dto.validationRules),
        aggregation_window: dto.aggregationWindow || 'DAILY',
        dedupe_policy: dto.dedupePolicy || 'SOURCE_EVENT_ID',
        included_quantity: dto.includedQuantity ?? 0,
        billable_policy: dto.billablePolicy || 'STANDARD',
        correction_policy:
          dto.correctionPolicy || 'REVERSAL_REPLACEMENT_ADJUSTMENT',
        status: 'DRAFT',
        requested_by: requestedBy,
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
    if (definition.requested_by === approvedBy) {
      throw new ForbiddenException(
        `Approver '${approvedBy}' cannot approve a meter definition they requested`,
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

  listDefinitions() {
    return this.prisma.meterDefinition.findMany({
      orderBy: [{ meter_key: 'asc' }, { version: 'desc' }],
    });
  }

  async getDefinition(id: string) {
    const definition = await this.prisma.meterDefinition.findUnique({
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException(`Meter definition '${id}' not found`);
    }
    return definition;
  }

  async getActiveDefinition(meterKey: string, asOf = new Date()) {
    const definition = await this.prisma.meterDefinition.findFirst({
      where: {
        meter_key: meterKey,
        status: 'APPROVED',
        effective_from: { lte: asOf },
        OR: [{ effective_to: null }, { effective_to: { gt: asOf } }],
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
