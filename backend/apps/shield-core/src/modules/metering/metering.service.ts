import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsPositive, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { MeterDefinitionService } from './meter-definition.service';

export class RecordMeterEventDto {
  @IsString()
  tenantId!: string;

  @IsString()
  meterKey!: string;

  @IsString()
  source!: string;

  @IsString()
  sourceEventId!: string;

  @IsISO8601()
  occurredAt!: Date;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;

  /** Set by the upstream normalization/ingestion pipeline, not inferred here. */
  @IsOptional()
  @IsIn(['NORMAL', 'REJECTED', 'QUARANTINED'])
  intake?: 'NORMAL' | 'REJECTED' | 'QUARANTINED';

  @IsOptional()
  @IsBoolean()
  isPlatformGenerated?: boolean;
}

/**
 * ZS-COM-BILL-001 Part 7 core rule: security telemetry != billing
 * telemetry. Every event is recorded for audit, but only a first-seen,
 * non-rejected, non-platform-generated event on a STANDARD meter ever
 * becomes billable quantity.
 */
@Injectable()
export class MeteringService {
  private readonly logger = new Logger(MeteringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meterDefinitionService: MeterDefinitionService,
  ) {}

  async recordEvent(dto: RecordMeterEventDto) {
    const definition = await this.meterDefinitionService.getActiveDefinition(dto.meterKey);
    if (!definition) {
      throw new ConflictException({
        statusCode: 409,
        error: 'NO_APPROVED_METER_DEFINITION',
        message: `No approved, effective meter definition for '${dto.meterKey}'`,
      });
    }

    const quantity = dto.quantity ?? 1;
    const dedupeKey = `${dto.source}:${dto.sourceEventId}`;
    const intake = dto.intake || 'NORMAL';

    if (intake !== 'NORMAL') {
      const event = await this.prisma.meterEvent.create({
        data: {
          tenant_id: dto.tenantId,
          meter_definition_id: definition.id,
          source: dto.source,
          source_event_id: dto.sourceEventId,
          occurred_at: dto.occurredAt,
          quantity,
          unit: definition.unit,
          accepted_state: intake, // REJECTED | QUARANTINED
          billable_state: 'NON_BILLABLE',
          dedupe_key: dedupeKey,
          is_platform_generated: dto.isPlatformGenerated || false,
        },
      });
      return { event, duplicate: false, usageRecord: null };
    }

    const priorAccepted = await this.prisma.meterEvent.findFirst({
      where: {
        tenant_id: dto.tenantId,
        meter_definition_id: definition.id,
        dedupe_key: dedupeKey,
        accepted_state: { in: ['ACCEPTED', 'NORMALIZED'] },
      },
    });

    if (priorAccepted) {
      const duplicateEvent = await this.prisma.meterEvent.create({
        data: {
          tenant_id: dto.tenantId,
          meter_definition_id: definition.id,
          source: dto.source,
          source_event_id: dto.sourceEventId,
          occurred_at: dto.occurredAt,
          quantity,
          unit: definition.unit,
          accepted_state: 'DUPLICATE',
          billable_state: 'NON_BILLABLE',
          dedupe_key: dedupeKey,
          is_platform_generated: dto.isPlatformGenerated || false,
          correction_of_event_id: priorAccepted.id,
        },
      });
      return { event: duplicateEvent, duplicate: true, usageRecord: null };
    }

    // Principle 5: platform-generated detections/summaries/AI content must
    // never silently become customer-billable ingestion.
    const billable =
      !dto.isPlatformGenerated && definition.billable_policy !== 'NEVER_BILLABLE';

    const event = await this.prisma.meterEvent.create({
      data: {
        tenant_id: dto.tenantId,
        meter_definition_id: definition.id,
        source: dto.source,
        source_event_id: dto.sourceEventId,
        occurred_at: dto.occurredAt,
        quantity,
        unit: definition.unit,
        accepted_state: 'ACCEPTED',
        billable_state: billable ? 'BILLABLE' : 'NON_BILLABLE',
        dedupe_key: dedupeKey,
        is_platform_generated: dto.isPlatformGenerated || false,
      },
    });

    const usageRecord = await this.prisma.usageRecord.create({
      data: {
        tenant_id: dto.tenantId,
        source_type: dto.source,
        raw_event_id: event.id,
        unit: definition.unit,
        accepted_quantity: quantity,
        billable_quantity: billable ? quantity : 0,
        usage_state: 'ACCEPTED',
      },
    });

    return { event, duplicate: false, usageRecord };
  }
}
