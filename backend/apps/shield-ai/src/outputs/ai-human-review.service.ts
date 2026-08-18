import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiOutputService } from './ai-output.service';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../kafka/kafka-producer.service';

export type ReviewDecision = 'APPROVED' | 'MODIFIED' | 'REJECTED';

@Injectable()
export class AiHumanReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiOutputService: AiOutputService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async recordReview(params: {
    tenantId: string;
    outputId: string;
    reviewerId: string;
    decision: ReviewDecision;
    rationale?: string;
    modifiedContent?: string;
    correlationId: string;
  }) {
    // Confirms the output exists and belongs to this tenant (throws otherwise).
    await this.aiOutputService.getById(params.tenantId, params.outputId);

    const [review] = await this.prisma.$transaction([
      this.prisma.aiHumanReview.create({
        data: {
          tenant_id: params.tenantId,
          ai_output_id: params.outputId,
          reviewer_id: params.reviewerId,
          decision: params.decision,
          rationale: params.rationale,
          modified_content: params.modifiedContent,
        },
      }),
      this.prisma.aiOutput.update({
        where: { id: params.outputId },
        data: { review_status: params.decision },
      }),
    ]);

    await this.kafkaProducer.publishEvent(
      CANONICAL_TOPICS.AI_OUTPUT_REVIEWED,
      'ai.output.reviewed',
      {
        tenantId: params.tenantId,
        aiOutputId: params.outputId,
        decision: params.decision,
      },
      { correlationId: params.correlationId },
    );

    return review;
  }
}
