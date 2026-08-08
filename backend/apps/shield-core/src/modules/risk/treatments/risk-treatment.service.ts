import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

export interface CreateTreatmentInput {
  tenantId: string;
  riskId: string;
  treatmentType: 'MITIGATE' | 'TRANSFER' | 'AVOID' | 'ACCEPT';
  plan: string;
  ownerId: string;
  dueAt?: Date;
}

@Injectable()
export class RiskTreatmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(input: CreateTreatmentInput) {
    const treatmentId = randomUUID();
    const [treatment] = await this.prisma.$transaction([
      this.prisma.riskTreatment.create({
        data: {
          id: treatmentId,
          tenant_id: input.tenantId,
          risk_id: input.riskId,
          treatment_type: input.treatmentType,
          plan: input.plan,
          owner_id: input.ownerId,
          due_at: input.dueAt,
          status: 'PLANNED',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({ tenantId: input.tenantId, topic: CANONICAL_TOPICS.RISK_TREATMENT_CREATED, eventType: 'risk.treatment.created', payload: { riskId: input.riskId, treatmentId } }),
      }),
    ]);
    return treatment;
  }
}
