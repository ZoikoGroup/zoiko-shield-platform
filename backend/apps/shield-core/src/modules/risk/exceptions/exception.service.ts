import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

export interface CreateExceptionInput {
  tenantId: string;
  controlObjectiveId?: string;
  controlImplementationId?: string;
  requirementId?: string;
  riskId?: string;
  reason: string;
  scope?: Record<string, unknown>;
  compensatingControls: string[];
  requestedBy: string;
  startsAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ExceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async request(input: CreateExceptionInput) {
    const exceptionId = randomUUID();
    const [exception] = await this.prisma.$transaction([
      this.prisma.exception.create({
        data: {
          id: exceptionId,
          tenant_id: input.tenantId,
          control_objective_id: input.controlObjectiveId,
          control_implementation_id: input.controlImplementationId,
          requirement_id: input.requirementId,
          risk_id: input.riskId,
          reason: input.reason,
          scope: JSON.stringify(input.scope ?? {}),
          compensating_controls: JSON.stringify(input.compensatingControls),
          requested_by: input.requestedBy,
          starts_at: input.startsAt,
          expires_at: input.expiresAt,
          status: 'REQUESTED',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: input.tenantId,
          topic: CANONICAL_TOPICS.EXCEPTION_REQUESTED,
          eventType: 'exception.requested',
          payload: { exceptionId },
        }),
      }),
    ]);
    return exception;
  }

  async approve(tenantId: string, exceptionId: string, approverId: string) {
    const exception = await this.prisma.exception.findFirst({
      where: { id: exceptionId, tenant_id: tenantId },
    });
    if (!exception) {
      throw new NotFoundException(`Exception '${exceptionId}' not found`);
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.exception.update({
        where: { id: exception.id },
        data: { status: 'APPROVED', approved_by: approverId },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.EXCEPTION_APPROVED,
          eventType: 'exception.approved',
          payload: { exceptionId },
        }),
      }),
    ]);
    return updated;
  }

  async revoke(tenantId: string, exceptionId: string) {
    return this.prisma.exception.update({
      where: { id: exceptionId },
      data: { status: 'REVOKED' },
    });
  }

  async isCurrentlyEffective(
    exceptionId: string,
    asOf: Date = new Date(),
  ): Promise<boolean> {
    const exception = await this.prisma.exception.findUnique({
      where: { id: exceptionId },
    });
    if (!exception) return false;
    return (
      exception.status === 'APPROVED' &&
      exception.starts_at <= asOf &&
      exception.expires_at > asOf
    );
  }
}
