import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DecisionOrigin } from './human-authority.dto';
import type { HumanAuthorityAction } from './human-authority.decorator';

interface AuthorityInput {
  tenantId: string;
  environmentId: string;
  actionClass: HumanAuthorityAction;
  resourceType: string;
  resourceId: string;
  actorId: string;
  decisionOrigin?: DecisionOrigin;
  humanConfirmation?: boolean;
  authorityStatement?: string;
  aiOutputId?: string;
  aiHumanReviewId?: string;
  authorizationContext?: Record<string, unknown>;
}

/**
 * Category H human authority boundary. AI output may be reviewed evidence,
 * but it can never be the authority that permits a protected decision.
 */
@Injectable()
export class HumanAuthorityService {
  constructor(private readonly prisma: PrismaService) {}

  private async record(
    input: AuthorityInput,
    decision: 'PERMIT' | 'DENY',
    reason: string,
  ) {
    const decisionOrigin =
      input.decisionOrigin &&
      ['HUMAN', 'AI_ASSISTED', 'AI_AUTONOMOUS'].includes(input.decisionOrigin)
        ? input.decisionOrigin
        : 'MISSING';
    const authorityStatement =
      typeof input.authorityStatement === 'string'
        ? input.authorityStatement.trim()
        : '';
    const authorizationContext = {
      ...(input.authorizationContext ?? {}),
      ...(decision === 'DENY' && input.aiOutputId
        ? { attemptedAiOutputId: input.aiOutputId }
        : {}),
      ...(decision === 'DENY' && input.aiHumanReviewId
        ? { attemptedAiHumanReviewId: input.aiHumanReviewId }
        : {}),
    };
    return this.prisma.aiHumanAuthorityDecision.create({
      data: {
        tenant_id: input.tenantId,
        environment_id: input.environmentId,
        action_class: input.actionClass,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        actor_id: input.actorId,
        decision_origin: decisionOrigin,
        ai_output_id: decision === 'PERMIT' ? input.aiOutputId : undefined,
        ai_human_review_id:
          decision === 'PERMIT' ? input.aiHumanReviewId : undefined,
        human_confirmation: input.humanConfirmation ?? false,
        authority_statement: authorityStatement || 'MISSING_HUMAN_ATTESTATION',
        decision,
        reason,
        authorization_context: JSON.stringify(authorizationContext),
      },
    });
  }

  private async deny(input: AuthorityInput, reason: string): Promise<never> {
    await this.record(input, 'DENY', reason);
    throw new ForbiddenException({
      statusCode: 403,
      error: 'HUMAN_AUTHORITY_REQUIRED',
      message: reason,
    });
  }

  async authorize(input: AuthorityInput) {
    const authorityStatement =
      typeof input.authorityStatement === 'string'
        ? input.authorityStatement.trim()
        : '';
    if (
      !input.decisionOrigin ||
      !['HUMAN', 'AI_ASSISTED', 'AI_AUTONOMOUS'].includes(
        input.decisionOrigin,
      ) ||
      !input.humanConfirmation ||
      authorityStatement.length < 12
    ) {
      return this.deny(
        input,
        'Protected decisions require an explicit authenticated-human confirmation and authority statement',
      );
    }
    if (input.decisionOrigin === 'AI_AUTONOMOUS') {
      return this.deny(
        input,
        `AI cannot independently authorize ${input.actionClass}`,
      );
    }
    if (input.decisionOrigin === 'HUMAN') {
      if (input.aiOutputId || input.aiHumanReviewId) {
        return this.deny(
          input,
          'AI references must be disclosed as AI_ASSISTED, not represented as a purely human decision',
        );
      }
    } else {
      if (!input.aiOutputId || !input.aiHumanReviewId) {
        return this.deny(
          input,
          'AI-assisted authority requires the exact AI output and human-review receipt',
        );
      }
      const [output, review] = await Promise.all([
        this.prisma.aiOutput.findFirst({
          where: {
            id: input.aiOutputId,
            tenant_id: input.tenantId,
            environment_id: input.environmentId,
          },
        }),
        this.prisma.aiHumanReview.findFirst({
          where: {
            id: input.aiHumanReviewId,
            tenant_id: input.tenantId,
            ai_output_id: input.aiOutputId,
            decision: { in: ['APPROVED', 'MODIFIED'] },
          },
        }),
      ]);
      if (
        !output ||
        !review ||
        !['PASS', 'PASSED', 'SAFE', 'DEGRADED'].includes(output.safety_result)
      ) {
        return this.deny(
          input,
          'AI-assisted authority requires a tenant-bound safe output and an APPROVED or MODIFIED human review',
        );
      }
    }
    return this.record(
      input,
      'PERMIT',
      input.decisionOrigin === 'AI_ASSISTED'
        ? 'Authenticated human accepted authority after governed AI review'
        : 'Authenticated human exercised authority without AI evidence',
    );
  }
}
