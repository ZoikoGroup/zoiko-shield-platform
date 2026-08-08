import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

export interface RiskFactorInput {
  factor: string;
  value: string;
  contribution: number;
  sourceRef: string;
  evaluatorVersion?: string;
}

export interface CreateRiskInput {
  tenantId: string;
  title: string;
  description: string;
  sourceType: string;
  sourceId: string;
  likelihood: string;
  impact: string;
  ownerId: string;
  factors: RiskFactorInput[];
}

/** Risk score is never a bare number — it's always the sum/explanation of persisted RiskFactor rows (spec §23/§24). */
@Injectable()
export class RiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(input: CreateRiskInput) {
    if (input.factors.length === 0) {
      throw new BadRequestException('A Risk must be created with at least one transparent RiskFactor');
    }

    const riskId = randomUUID();
    const [risk] = await this.prisma.$transaction([
      this.prisma.risk.create({
        data: {
          id: riskId,
          tenant_id: input.tenantId,
          title: input.title,
          description: input.description,
          source_type: input.sourceType,
          source_id: input.sourceId,
          likelihood: input.likelihood,
          impact: input.impact,
          status: 'OPEN',
          owner_id: input.ownerId,
        },
      }),
      ...input.factors.map((f) =>
        this.prisma.riskFactor.create({
          data: {
            id: randomUUID(),
            tenant_id: input.tenantId,
            risk_id: riskId,
            factor: f.factor,
            value: f.value,
            contribution: f.contribution,
            source_ref: f.sourceRef,
            evaluator_version: f.evaluatorVersion,
          },
        }),
      ),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({ tenantId: input.tenantId, topic: CANONICAL_TOPICS.RISK_CREATED, eventType: 'risk.created', payload: { riskId } }),
      }),
    ]);
    return risk;
  }

  async assertTenantOwnership(tenantId: string, riskId: string) {
    const risk = await this.prisma.risk.findFirst({ where: { id: riskId, tenant_id: tenantId } });
    if (!risk) {
      throw new NotFoundException(`Risk '${riskId}' not found`);
    }
    return risk;
  }

  async getWithFactors(tenantId: string, riskId: string) {
    const risk = await this.assertTenantOwnership(tenantId, riskId);
    const factors = await this.prisma.riskFactor.findMany({ where: { risk_id: risk.id } });
    return { risk, factors };
  }

  async list(tenantId: string) {
    return this.prisma.risk.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'desc' } });
  }
}
