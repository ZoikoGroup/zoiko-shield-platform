import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  DecisionRightsService,
  RecordDecisionInput,
  ActorAuthorizationContext,
} from './decision-rights.service';
import { DecisionState, ResponseAuthorityTier } from './ai-review-envelope.interface';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';

export class AcceptDecisionDto {
  decidedBy!: string;
  rationale!: string;
}

export class ModifyDecisionDto {
  decidedBy!: string;
  rationale!: string;
  modifiedContent!: string;
}

export class RejectDecisionDto {
  decidedBy!: string;
  rationale!: string;
}

export class EscalateDecisionDto {
  decidedBy!: string;
  rationale!: string;
  escalatedToRole!: string;
}

export class VerifyActionDto {
  role!: string;
  responseAuthorityTier?: ResponseAuthorityTier;
}

@UseGuards(InternalAuthGuard)
@Controller('api/v1/ai/decisions')
export class DecisionRightsController {
  constructor(private readonly decisionRightsService: DecisionRightsService) {}

  @Get(':envelopeId')
  getEnvelope(
    @Headers('x-tenant-id') tenantId: string,
    @Param('envelopeId') envelopeId: string,
  ) {
    const resolvedTenant = tenantId || 'default-tenant';
    return this.decisionRightsService.getEnvelope(resolvedTenant, envelopeId);
  }

  @Get()
  listEnvelopes(
    @Headers('x-tenant-id') tenantId: string,
    @Query('state') state?: string,
    @Query('useCase') useCase?: string,
  ) {
    const resolvedTenant = tenantId || 'default-tenant';
    return this.decisionRightsService.listEnvelopes(resolvedTenant, {
      state: state as any,
      useCase,
    });
  }

  @Post(':envelopeId/accept')
  async acceptRecommendation(
    @Headers('x-tenant-id') tenantId: string,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: AcceptDecisionDto,
  ) {
    const resolvedTenant = tenantId || 'default-tenant';
    return this.decisionRightsService.recordHumanDecision(
      resolvedTenant,
      envelopeId,
      {
        decision: 'ACCEPT',
        decidedBy: dto.decidedBy,
        rationale: dto.rationale,
      },
    );
  }

  @Post(':envelopeId/modify')
  async modifyRecommendation(
    @Headers('x-tenant-id') tenantId: string,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: ModifyDecisionDto,
  ) {
    const resolvedTenant = tenantId || 'default-tenant';
    return this.decisionRightsService.recordHumanDecision(
      resolvedTenant,
      envelopeId,
      {
        decision: 'MODIFY',
        decidedBy: dto.decidedBy,
        rationale: dto.rationale,
        modifiedContent: dto.modifiedContent,
      },
    );
  }

  @Post(':envelopeId/reject')
  async rejectRecommendation(
    @Headers('x-tenant-id') tenantId: string,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: RejectDecisionDto,
  ) {
    const resolvedTenant = tenantId || 'default-tenant';
    return this.decisionRightsService.recordHumanDecision(
      resolvedTenant,
      envelopeId,
      {
        decision: 'REJECT',
        decidedBy: dto.decidedBy,
        rationale: dto.rationale,
      },
    );
  }

  @Post(':envelopeId/escalate')
  async escalateRecommendation(
    @Headers('x-tenant-id') tenantId: string,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: EscalateDecisionDto,
  ) {
    const resolvedTenant = tenantId || 'default-tenant';
    return this.decisionRightsService.recordHumanDecision(
      resolvedTenant,
      envelopeId,
      {
        decision: 'ESCALATE',
        decidedBy: dto.decidedBy,
        rationale: dto.rationale,
        escalatedToRole: dto.escalatedToRole,
      },
    );
  }

  @Post(':envelopeId/verify-action')
  verifyActionPermitted(
    @Headers('x-tenant-id') tenantId: string,
    @Param('envelopeId') envelopeId: string,
    @Body() dto: VerifyActionDto,
  ) {
    const resolvedTenant = tenantId || 'default-tenant';
    return this.decisionRightsService.assertActionPermitted(
      resolvedTenant,
      envelopeId,
      {
        role: dto.role,
        responseAuthorityTier: dto.responseAuthorityTier,
      },
    );
  }
}
