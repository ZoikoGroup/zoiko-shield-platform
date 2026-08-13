import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  KafkaProducerService,
  CANONICAL_TOPICS,
} from '../kafka/kafka-producer.service';

export interface CreateAiOutputInput {
  tenantId: string;
  environmentId: string;
  useCaseId: string;
  modelProfileId: string;
  promptProfileId: string;
  retrievalBundleId?: string;
  outputType: string;
  content: string;
  citations: Array<{ sourceType: string; sourceId: string }>;
  limitations: string[];
  safetyResult: string;
  authorizationDecisionId: string;
  correlationId: string;
}

@Injectable()
export class AiOutputService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async create(input: CreateAiOutputInput) {
    const output = await this.prisma.aiOutput.create({
      data: {
        tenant_id: input.tenantId,
        environment_id: input.environmentId,
        use_case_id: input.useCaseId,
        model_profile_id: input.modelProfileId,
        prompt_profile_id: input.promptProfileId,
        retrieval_bundle_id: input.retrievalBundleId,
        output_type: input.outputType,
        content: input.content,
        citations: JSON.stringify(input.citations),
        limitations: JSON.stringify(input.limitations),
        safety_result: input.safetyResult,
        review_status: 'UNREVIEWED',
        authorization_decision_id: input.authorizationDecisionId,
        correlation_id: input.correlationId,
      },
    });

    await this.kafkaProducer.publishEvent(
      CANONICAL_TOPICS.AI_COMPLETED,
      'ai.completed',
      {
        tenantId: input.tenantId,
        aiOutputId: output.id,
        useCaseId: input.useCaseId,
        safetyResult: input.safetyResult,
      },
      { correlationId: input.correlationId },
    );

    return output;
  }

  /** Cross-tenant access is rejected explicitly, not merely filtered — mirrors EvidenceService.assertTenantOwnership. */
  async getById(tenantId: string, outputId: string) {
    const output = await this.prisma.aiOutput.findUnique({
      where: { id: outputId },
    });
    if (!output) {
      throw new NotFoundException(`AiOutput '${outputId}' not found`);
    }
    if (output.tenant_id !== tenantId) {
      throw new ForbiddenException(
        `AiOutput '${outputId}' does not belong to this tenant`,
      );
    }
    return output;
  }
}
