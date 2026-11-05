import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

// These are also the request bodies of FinancialPeriodCloseController: the
// global ValidationPipe (whitelist: true) strips any undecorated property.
export class CloseFinancialPeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  periodKey!: string; // e.g. '2026-07'

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  @IsString()
  @MaxLength(4000)
  closingNotes!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  approverId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  dualControlSignoffId!: string;
}

export class RequestEmergencyOverrideDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  periodKey!: string;

  @IsIn(['INVOICE', 'PAYMENT', 'METER_EXPORT', 'PARTNER_SETTLEMENT'])
  targetDomain!: 'INVOICE' | 'PAYMENT' | 'METER_EXPORT' | 'PARTNER_SETTLEMENT';

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  justificationRef!: string;
}

@Injectable()
export class FinancialPeriodCloseService {
  constructor(private readonly prisma: PrismaService) {}

  async closePeriod(dto: CloseFinancialPeriodDto, actorId: string) {
    if (!dto.periodKey || !dto.approverId || !dto.dualControlSignoffId) {
      throw new BadRequestException(
        'periodKey, approverId, and dualControlSignoffId are required for period close',
      );
    }

    if (
      dto.approverId === dto.dualControlSignoffId ||
      dto.approverId === actorId
    ) {
      throw new ConflictException(
        'Dual-control rule violation: Approver and Dual-Control sign-off must be distinct users',
      );
    }

    const openIssues = await this.prisma.reconciliationIssue.count({
      where: { status: 'OPEN', severity: 'CRITICAL' },
    });

    if (openIssues > 0) {
      throw new ConflictException(
        `Cannot lock period '${dto.periodKey}': ${openIssues} CRITICAL open reconciliation issues must be resolved first`,
      );
    }

    const event = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'financial_period.closed',
        actor: actorId,
        idempotency_key: `period-close-${dto.periodKey}`,
        payload: JSON.stringify({
          periodKey: dto.periodKey,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          closingNotes: dto.closingNotes,
          approverId: dto.approverId,
          dualControlSignoffId: dto.dualControlSignoffId,
          lockedAt: new Date().toISOString(),
          status: 'LOCKED',
        }),
      },
    });

    return {
      id: event.id,
      periodKey: dto.periodKey,
      status: 'LOCKED',
      lockedAt: event.created_at,
      lockedBy: actorId,
      approverId: dto.approverId,
      dualControlSignoffId: dto.dualControlSignoffId,
    };
  }

  async isPeriodLocked(periodKey: string): Promise<boolean> {
    const event = await this.prisma.commercialEvent.findFirst({
      where: {
        event_type: 'financial_period.closed',
        idempotency_key: `period-close-${periodKey}`,
      },
    });
    return Boolean(event);
  }

  async requestEmergencyOverride(
    dto: RequestEmergencyOverrideDto,
    actorId: string,
  ) {
    const isLocked = await this.isPeriodLocked(dto.periodKey);
    if (!isLocked) {
      throw new BadRequestException(
        `Period '${dto.periodKey}' is not locked; standard mutation rules apply`,
      );
    }

    const overrideEvent = await this.prisma.commercialEvent.create({
      data: {
        event_type: 'financial_period.emergency_override_requested',
        actor: actorId,
        idempotency_key: `emergency-override-${dto.periodKey}-${Date.now()}`,
        payload: JSON.stringify({
          periodKey: dto.periodKey,
          targetDomain: dto.targetDomain,
          reason: dto.reason,
          justificationRef: dto.justificationRef,
          status: 'PENDING_DUAL_APPROVAL',
        }),
      },
    });

    return {
      overrideId: overrideEvent.id,
      periodKey: dto.periodKey,
      targetDomain: dto.targetDomain,
      status: 'PENDING_DUAL_APPROVAL',
      requestedBy: actorId,
      requestedAt: overrideEvent.created_at,
    };
  }

  async listPeriodStatuses() {
    const events = await this.prisma.commercialEvent.findMany({
      where: {
        event_type: {
          in: [
            'financial_period.closed',
            'financial_period.emergency_override_requested',
          ],
        },
      },
      orderBy: { created_at: 'desc' },
      take: 20,
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
