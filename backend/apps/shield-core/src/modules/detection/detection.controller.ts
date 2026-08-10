import { Controller, Get, Post, Param, Query, Headers, Body, HttpStatus, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DetectionRegistryService } from './registry/detection-registry.service';
import { DetectionReplayService } from './replay/detection-replay.service';

export class CreateDetectionDefinitionDto {
  key!: string;
  name!: string;
  description?: string;
  owner?: string;
  category?: string;
}

export class CreateDetectionVersionDto {
  version!: number;
  severity?: string;
  ruleType?: string;
  configuration?: Record<string, any>;
  requiredEventTypes?: string[];
  requiredFields?: string[];
  requiredContext?: string[];
  allowedMissingDataBehavior?: string;
}

@Controller('api/v1/detections')
export class DetectionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DetectionRegistryService,
    private readonly replayService: DetectionReplayService,
  ) {}

  @Post('definitions')
  async createDefinition(@Body() dto: CreateDetectionDefinitionDto) {
    const definition = await this.prisma.detectionDefinition.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        owner: dto.owner,
        category: dto.category || 'IDENTITY',
      },
    });
    return { statusCode: HttpStatus.CREATED, data: definition };
  }

  @Get('definitions')
  async listDefinitions() {
    const definitions = await this.prisma.detectionDefinition.findMany({ include: { versions: true } });
    return { statusCode: HttpStatus.OK, data: definitions };
  }

  @Post('definitions/:definitionId/versions')
  async createVersion(@Param('definitionId') definitionId: string, @Body() dto: CreateDetectionVersionDto) {
    const version = await this.prisma.detectionVersion.create({
      data: {
        detection_definition_id: definitionId,
        version: dto.version,
        severity: dto.severity || 'MEDIUM',
        rule_type: dto.ruleType || 'POINT',
        configuration: JSON.stringify(dto.configuration || {}),
        required_event_types: JSON.stringify(dto.requiredEventTypes || []),
        required_fields: JSON.stringify(dto.requiredFields || []),
        required_context: JSON.stringify(dto.requiredContext || []),
        allowed_missing_data_behavior: dto.allowedMissingDataBehavior || 'INDETERMINATE',
        status: 'DRAFT',
      },
    });
    return { statusCode: HttpStatus.CREATED, data: version };
  }

  @Post('versions/:versionId/publish')
  async publishVersion(@Param('versionId') versionId: string) {
    const version = await this.registry.publish(versionId);
    return { statusCode: HttpStatus.OK, data: version };
  }

  @Get('matches')
  async listMatches(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const matches = await this.prisma.detectionMatch.findMany({
      where: { tenant_id: tenantId },
      take: limit ? Number(limit) : 50,
      orderBy: { detected_at: 'desc' },
    });
    return { statusCode: HttpStatus.OK, data: matches };
  }

  @Get('evaluations/:evaluationId')
  async getEvaluation(@Param('evaluationId') evaluationId: string) {
    const evaluation = await this.prisma.detectionEvaluation.findUnique({ where: { id: evaluationId } });
    if (!evaluation) {
      throw new NotFoundException(`DetectionEvaluation '${evaluationId}' not found`);
    }
    return { statusCode: HttpStatus.OK, data: evaluation };
  }

  @Post('evaluations/:evaluationId/replay')
  async replay(@Param('evaluationId') evaluationId: string) {
    const replay = await this.replayService.replay(evaluationId);
    return { statusCode: HttpStatus.OK, data: replay };
  }
}
