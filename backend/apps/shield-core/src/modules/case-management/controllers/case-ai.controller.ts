import {
  Controller,
  Post,
  Param,
  Headers,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CaseAiService } from '../services/case-ai.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import {
  requireEnvironmentId,
  requireRegion,
  requireTenantId,
} from '../../../tenant-context';

export class InvokeAiDto {
  actorId?: string;
}

export class ReviewOutputDto {
  decision!: string;
  rationale?: string;
  modifiedContent?: string;
  actorId?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1')
export class CaseAiController {
  constructor(private readonly caseAiService: CaseAiService) {}

  private resolveTenantId(headerTenantId: string): string {
    return requireTenantId(headerTenantId);
  }
  @Post('cases/:caseId/ai/summary')
  async summary(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.caseAiService.invoke({
      tenantId: this.resolveTenantId(headerTenantId),
      caseId,
      useCaseSlug: 'summary',
      actorId: user.id,
    });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('cases/:caseId/ai/hypotheses')
  async hypotheses(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.caseAiService.invoke({
      tenantId: this.resolveTenantId(headerTenantId),
      caseId,
      useCaseSlug: 'hypotheses',
      actorId: user.id,
    });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('cases/:caseId/ai/next-queries')
  async nextQueries(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.caseAiService.invoke({
      tenantId: this.resolveTenantId(headerTenantId),
      caseId,
      useCaseSlug: 'next-queries',
      actorId: user.id,
    });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('cases/:caseId/ai/response-recommendation')
  async responseRecommendation(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.caseAiService.invoke({
      tenantId: this.resolveTenantId(headerTenantId),
      caseId,
      useCaseSlug: 'response-recommendation',
      actorId: user.id,
    });
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Post('ai/outputs/:outputId/review')
  async reviewOutput(
    @Headers('x-tenant-id') headerTenantId: string,
    @Headers('x-environment-id') environmentId: string,
    @Headers('x-region') region: string,
    @Param('outputId') outputId: string,
    @Body() dto: ReviewOutputDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.caseAiService.review({
      tenantId: this.resolveTenantId(headerTenantId),
      environmentId: requireEnvironmentId(environmentId),
      region: requireRegion(region),
      outputId,
      actorId: user.id,
      decision: dto.decision,
      rationale: dto.rationale,
      modifiedContent: dto.modifiedContent,
    });
    return { statusCode: HttpStatus.OK, data: result };
  }
}
