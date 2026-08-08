import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

export interface DetectGapInput {
  tenantId: string;
  expectedEvidenceRuleId: string;
  controlTestVersionId?: string;
  reason: 'MISSING_SOURCE' | 'STALE_SOURCE' | 'PERMISSION_REVOKED' | 'CONNECTOR_UNHEALTHY' | 'PARTIAL_POPULATION' | 'EVALUATOR_FAILED';
  scope?: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
  severity?: string;
  sourceHealthState?: string;
}

/** Gaps are first-class and always visible — never filtered out of a report or audit package (spec §13/§36). */
@Injectable()
export class EvidenceGapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async detect(input: DetectGapInput) {
    const [gap] = await this.prisma.$transaction([
      this.prisma.evidenceGap.create({
        data: {
          id: randomUUID(),
          tenant_id: input.tenantId,
          expected_evidence_rule_id: input.expectedEvidenceRuleId,
          control_test_version_id: input.controlTestVersionId,
          reason: input.reason,
          scope: JSON.stringify(input.scope ?? {}),
          period_start: input.periodStart,
          period_end: input.periodEnd,
          severity: input.severity,
          source_health_state: input.sourceHealthState,
          status: 'OPEN',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: input.tenantId,
          topic: CANONICAL_TOPICS.EVIDENCE_GAP_DETECTED,
          eventType: 'evidence.gap.detected',
          payload: { expectedEvidenceRuleId: input.expectedEvidenceRuleId, reason: input.reason },
        }),
      }),
    ]);
    return gap;
  }

  async resolve(tenantId: string, gapId: string) {
    const [gap] = await this.prisma.$transaction([
      this.prisma.evidenceGap.update({ where: { id: gapId }, data: { status: 'RESOLVED', resolved_at: new Date() } }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.EVIDENCE_GAP_RESOLVED,
          eventType: 'evidence.gap.resolved',
          payload: { gapId },
        }),
      }),
    ]);
    return gap;
  }

  async listOpenForTenant(tenantId: string) {
    return this.prisma.evidenceGap.findMany({ where: { tenant_id: tenantId, status: 'OPEN' } });
  }
}
