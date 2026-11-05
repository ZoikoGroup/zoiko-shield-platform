import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// These are also the request bodies of UsageCorrectionController: the global
// ValidationPipe (whitelist: true) strips any undecorated property.
export class SubmitUsageDisputeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  meterDefinitionId!: string;

  @IsISO8601()
  disputedPeriodStart!: string;

  @IsISO8601()
  disputedPeriodEnd!: string;

  // A claimed usage quantity cannot be negative.
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  claimedQuantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;

  @IsString()
  @MaxLength(1024)
  evidenceReference!: string;
}

export class PostUsageCorrectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  disputeId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  meterDefinitionId!: string;

  @IsIn(['REVERSAL', 'REPLACEMENT', 'ADJUSTMENT'])
  correctionType!: 'REVERSAL' | 'REPLACEMENT' | 'ADJUSTMENT';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  originalRecordId?: string;

  // Signed: reversals and downward adjustments are negative.
  @IsNumber({ allowNaN: false, allowInfinity: false })
  adjustedQuantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  approvedBy!: string;
}

@Injectable()
export class UsageCorrectionService {
  constructor(private readonly prisma: PrismaService) {}

  async submitDispute(
    tenantId: string,
    dto: SubmitUsageDisputeDto,
    actorId: string,
  ) {
    if (!dto.meterDefinitionId || !dto.reason) {
      throw new BadRequestException(
        'meterDefinitionId and reason are required',
      );
    }

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'usage.dispute_submitted',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `dispute-${tenantId}-${Date.now()}`,
        payload: JSON.stringify({
          meterDefinitionId: dto.meterDefinitionId,
          disputedPeriodStart: dto.disputedPeriodStart,
          disputedPeriodEnd: dto.disputedPeriodEnd,
          claimedQuantity: dto.claimedQuantity,
          reason: dto.reason,
          evidenceReference: dto.evidenceReference,
          status: 'OPEN',
        }),
      },
    });

    return {
      disputeId: event.id,
      tenantId,
      meterDefinitionId: dto.meterDefinitionId,
      status: 'OPEN',
      submittedAt: event.created_at,
      submittedBy: actorId,
    };
  }

  async postCorrection(
    tenantId: string,
    dto: PostUsageCorrectionDto,
    actorId: string,
  ) {
    if (!dto.meterDefinitionId || dto.adjustedQuantity === undefined) {
      throw new BadRequestException(
        'meterDefinitionId and adjustedQuantity are required',
      );
    }

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'usage.correction_posted',
        tenant_id: tenantId,
        actor: actorId,
        idempotency_key: `correction-${tenantId}-${Date.now()}`,
        payload: JSON.stringify({
          disputeId: dto.disputeId,
          meterDefinitionId: dto.meterDefinitionId,
          correctionType: dto.correctionType,
          originalRecordId: dto.originalRecordId,
          adjustedQuantity: dto.adjustedQuantity,
          reason: dto.reason,
          approvedBy: dto.approvedBy,
          postedAt: new Date().toISOString(),
        }),
      },
    });

    return {
      correctionId: event.id,
      tenantId,
      meterDefinitionId: dto.meterDefinitionId,
      correctionType: dto.correctionType,
      adjustedQuantity: dto.adjustedQuantity,
      status: 'APPLIED',
      postedAt: event.created_at,
      postedBy: actorId,
    };
  }

  async listDisputes(tenantId: string) {
    const events = await this.prisma.commercialEvent.findMany({
      where: {
        tenant_id: tenantId,
        event_type: {
          in: ['usage.dispute_submitted', 'usage.correction_posted'],
        },
      },
      orderBy: { created_at: 'desc' },
      take: 30,
    });

    return events.map((e) => {
      try {
        return {
          id: e.id,
          eventType: e.event_type,
          createdAt: e.created_at,
          ...JSON.parse(e.payload),
        };
      } catch {
        return { id: e.id, eventType: e.event_type, createdAt: e.created_at };
      }
    });
  }
}
