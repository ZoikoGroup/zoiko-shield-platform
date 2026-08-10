import { Controller, Post, Get, Param, Headers, Body, HttpStatus } from '@nestjs/common';
import { CaseAiService } from '../services/case-ai.service';

export class InvokeAiDto {
  actorId?: string;
}

export class ReviewOutputDto {
  decision!: string;
  rationale?: string;
  modifiedContent?: string;
  actorId?: string;
}

@Controller('api/v1')
export class CaseAiController {
  constructor(private readonly caseAiService: CaseAiService) {}

  private resolveTenantId(headerTenantId: string): string {
    return headerTenantId || 'default-tenant';
  }
  private resolveActor(dtoActorId: string | undefined): string {
    return dtoActorId || 'system';
  }

  @Post('cases/:caseId/ai/summary')
  async summary(@Headers('x-tenant-id') headerTenantId: string, @Param('caseId') caseId: string, @Body() dto: InvokeAiDto) {
    const result = await this.caseAiService.invoke({ tenantId: this.resolveTenantId(headerTenantId), caseId, useCaseSlug: 'summary', actorId: this.resolveActor(dto.actorId) });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('cases/:caseId/ai/hypotheses')
  async hypotheses(@Headers('x-tenant-id') headerTenantId: string, @Param('caseId') caseId: string, @Body() dto: InvokeAiDto) {
    const result = await this.caseAiService.invoke({ tenantId: this.resolveTenantId(headerTenantId), caseId, useCaseSlug: 'hypotheses', actorId: this.resolveActor(dto.actorId) });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('cases/:caseId/ai/next-queries')
  async nextQueries(@Headers('x-tenant-id') headerTenantId: string, @Param('caseId') caseId: string, @Body() dto: InvokeAiDto) {
    const result = await this.caseAiService.invoke({ tenantId: this.resolveTenantId(headerTenantId), caseId, useCaseSlug: 'next-queries', actorId: this.resolveActor(dto.actorId) });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('cases/:caseId/ai/response-recommendation')
  async responseRecommendation(@Headers('x-tenant-id') headerTenantId: string, @Param('caseId') caseId: string, @Body() dto: InvokeAiDto) {
    const result = await this.caseAiService.invoke({ tenantId: this.resolveTenantId(headerTenantId), caseId, useCaseSlug: 'response-recommendation', actorId: this.resolveActor(dto.actorId) });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('ai/outputs/:outputId/review')
  async reviewOutput(@Headers('x-tenant-id') headerTenantId: string, @Param('outputId') outputId: string, @Body() dto: ReviewOutputDto) {
    const result = await this.caseAiService.review({
      tenantId: this.resolveTenantId(headerTenantId),
      outputId,
      actorId: this.resolveActor(dto.actorId),
      decision: dto.decision,
      rationale: dto.rationale,
      modifiedContent: dto.modifiedContent,
    });
    return { statusCode: HttpStatus.OK, data: result };
  }
}
