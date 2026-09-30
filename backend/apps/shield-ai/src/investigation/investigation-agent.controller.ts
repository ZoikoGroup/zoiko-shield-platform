import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { IsOptional, IsString, IsNumber, IsObject } from 'class-validator';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import { AutonomousInvestigationAgentService } from './autonomous-investigation-agent.service';

export class ExecuteReActInvestigationDto {
  @IsString()
  incidentId!: string;

  @IsString()
  findingSummary!: string;

  @IsOptional()
  @IsObject()
  initialEntities?: {
    user?: string;
    host?: string;
    ip?: string;
    resourceId?: string;
  };

  @IsOptional()
  @IsNumber()
  maxHops?: number;
}

@UseGuards(InternalAuthGuard)
@Controller('api/v1/ai/investigate')
export class InvestigationAgentController {
  constructor(
    private readonly investigationAgent: AutonomousInvestigationAgentService,
  ) {}

  /**
   * POST /api/v1/ai/investigate/react-loop
   * Initiate and execute an autonomous multi-hop ReAct threat investigation.
   */
  @Post('react-loop')
  async executeReActInvestigation(
    @Headers('x-tenant-id') tenantIdHeader: string | undefined,
    @Body() dto: ExecuteReActInvestigationDto,
  ) {
    const tenantId = tenantIdHeader || 'tenant-default';
    const report = await this.investigationAgent.runReActInvestigation({
      tenantId,
      incidentId: dto.incidentId,
      findingSummary: dto.findingSummary,
      initialEntities: dto.initialEntities,
      maxHops: dto.maxHops,
    });

    return {
      statusCode: HttpStatus.OK,
      data: report,
    };
  }

  /**
   * GET /api/v1/ai/investigate/:incidentId/graph
   * Fetch the causal incident provenance graph for a previously investigated incident.
   */
  @Get(':incidentId/graph')
  getProvenanceGraph(@Param('incidentId') incidentId: string) {
    const graph = this.investigationAgent.getProvenanceGraph(incidentId);
    if (!graph) {
      throw new NotFoundException(
        `Causal provenance graph for incident '${incidentId}' not found. Please initiate investigation first.`,
      );
    }

    return {
      statusCode: HttpStatus.OK,
      data: graph,
    };
  }
}
