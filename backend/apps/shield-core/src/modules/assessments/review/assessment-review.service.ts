import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';

export interface ReviewAssessmentInput {
  tenantId: string;
  assessmentId: string;
  reviewerId: string;
  approve: boolean;
}

/** A human reviewer is always required before an evaluated Assessment can be APPROVED — an automated result never self-approves (spec §19/§21). */
@Injectable()
export class AssessmentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async review(input: ReviewAssessmentInput) {
    const assessment = await this.prisma.assessment.findFirst({ where: { id: input.assessmentId, tenant_id: input.tenantId } });
    if (!assessment) {
      throw new NotFoundException(`Assessment '${input.assessmentId}' not found`);
    }
    if (assessment.status !== 'EVALUATED' && assessment.status !== 'REVIEW_REQUIRED') {
      throw new BadRequestException(`Assessment '${input.assessmentId}' is not in a reviewable state (${assessment.status})`);
    }
    if (assessment.performer_id && assessment.performer_id === input.reviewerId) {
      throw new BadRequestException('Assessment reviewer must be a different identity than the performer');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.assessment.update({
        where: { id: assessment.id },
        data: { status: input.approve ? 'APPROVED' : 'REVIEW_REQUIRED', reviewer_id: input.reviewerId, reviewed_at: new Date() },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId: input.tenantId,
          topic: CANONICAL_TOPICS.ASSESSMENT_REVIEWED,
          eventType: 'assessment.reviewed',
          payload: { assessmentId: assessment.id, approved: input.approve, reviewerId: input.reviewerId },
        }),
      }),
    ]);
    return updated;
  }
}
