import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

export interface CreateRiskAcceptanceInput {
  tenantId: string;
  riskId: string;
  acceptedBy: string;
  authority: string;
  rationale: string;
  compensatingControls: string[];
  validFrom: Date;
  expiresAt: Date;
  reviewAt: Date;
}

/**
 * Risk acceptance must be explicit — named authority, rationale,
 * compensating controls, expiry, review date, never permanent/silent
 * (spec §26). Corrections/renewals are immutable version rows via
 * supersedes_id — same bitemporal shape as ControlMappingService.
 */
@Injectable()
export class RiskAcceptanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(input: CreateRiskAcceptanceInput) {
    if (!input.authority || !input.rationale || input.compensatingControls.length === 0 || !input.expiresAt || !input.reviewAt) {
      throw new BadRequestException('RiskAcceptance requires authority, rationale, at least one compensating control, expiresAt, and reviewAt — no silent/permanent acceptance');
    }

    const acceptanceId = randomUUID();
    const [acceptance] = await this.prisma.$transaction([
      this.prisma.riskAcceptance.create({
        data: {
          id: acceptanceId,
          tenant_id: input.tenantId,
          risk_id: input.riskId,
          accepted_by: input.acceptedBy,
          authority: input.authority,
          rationale: input.rationale,
          compensating_controls: JSON.stringify(input.compensatingControls),
          valid_from: input.validFrom,
          expires_at: input.expiresAt,
          review_at: input.reviewAt,
          status: 'ACTIVE',
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({ tenantId: input.tenantId, topic: CANONICAL_TOPICS.RISK_ACCEPTED, eventType: 'risk.accepted', payload: { riskId: input.riskId, acceptanceId } }),
      }),
    ]);
    return acceptance;
  }

  /** A renewal/correction is a new immutable row — the row it supersedes is never written to again. */
  async renew(previousAcceptanceId: string, input: Omit<CreateRiskAcceptanceInput, 'tenantId' | 'riskId'>) {
    const previous = await this.prisma.riskAcceptance.findUnique({ where: { id: previousAcceptanceId } });
    if (!previous) {
      throw new NotFoundException(`RiskAcceptance '${previousAcceptanceId}' not found`);
    }
    if (!input.authority || !input.rationale || input.compensatingControls.length === 0 || !input.expiresAt || !input.reviewAt) {
      throw new BadRequestException('RiskAcceptance requires authority, rationale, at least one compensating control, expiresAt, and reviewAt');
    }
    return this.prisma.riskAcceptance.create({
      data: {
        id: randomUUID(),
        tenant_id: previous.tenant_id,
        risk_id: previous.risk_id,
        accepted_by: input.acceptedBy,
        authority: input.authority,
        rationale: input.rationale,
        compensating_controls: JSON.stringify(input.compensatingControls),
        valid_from: input.validFrom,
        expires_at: input.expiresAt,
        review_at: input.reviewAt,
        supersedes_id: previousAcceptanceId,
        status: 'ACTIVE',
      },
    });
  }

  /** Current-as-of query, same bitemporal semantics as ControlMappingService.resolveAsOf. */
  async resolveActiveForRisk(riskId: string, businessTime: Date = new Date(), systemTime: Date = new Date()) {
    return this.prisma.riskAcceptance.findMany({
      where: {
        risk_id: riskId,
        recorded_at: { lte: systemTime },
        valid_from: { lte: businessTime },
        OR: [{ valid_to: null }, { valid_to: { gt: businessTime } }],
      },
      orderBy: { recorded_at: 'desc' },
    });
  }
}
