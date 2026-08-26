import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SubmitUsageDisputeDto {
  meterDefinitionId: string;
  disputedPeriodStart: string;
  disputedPeriodEnd: string;
  claimedQuantity: number;
  reason: string;
  evidenceReference: string;
}

export interface PostUsageCorrectionDto {
  disputeId?: string;
  meterDefinitionId: string;
  correctionType: 'REVERSAL' | 'REPLACEMENT' | 'ADJUSTMENT';
  originalRecordId?: string;
  adjustedQuantity: number;
  reason: string;
  approvedBy: string;
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
      throw new BadRequestException('meterDefinitionId and reason are required');
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
        event_type: { in: ['usage.dispute_submitted', 'usage.correction_posted'] },
      },
      orderBy: { created_at: 'desc' },
      take: 30,
    });

    return events.map((e) => {
      try {
        return { id: e.id, eventType: e.event_type, createdAt: e.created_at, ...JSON.parse(e.payload) };
      } catch {
        return { id: e.id, eventType: e.event_type, createdAt: e.created_at };
      }
    });
  }
}
