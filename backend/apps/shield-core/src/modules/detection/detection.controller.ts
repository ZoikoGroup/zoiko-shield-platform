import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DetectionRegistryService } from './registry/detection-registry.service';
import { DetectionReplayService } from './replay/detection-replay.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { requireTenantId } from '../../tenant-context';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class CreateDetectionDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  owner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

export class CreateDetectionVersionDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ruleType?: string;

  // Rule configuration is rule-type specific; it is stored as JSON as-is.
  @IsOptional()
  @IsObject()
  configuration?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  requiredEventTypes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  requiredFields?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  requiredContext?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  allowedMissingDataBehavior?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/detections')
export class DetectionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: DetectionRegistryService,
    private readonly replayService: DetectionReplayService,
  ) {}

  @Post('definitions')
  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.DETECTION_MANAGE)
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
    const definitions = await this.prisma.detectionDefinition.findMany({
      include: { versions: true },
    });
    return { statusCode: HttpStatus.OK, data: definitions };
  }

  @Post('definitions/:definitionId/versions')
  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.DETECTION_MANAGE)
  async createVersion(
    @Param('definitionId') definitionId: string,
    @Body() dto: CreateDetectionVersionDto,
  ) {
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
        allowed_missing_data_behavior:
          dto.allowedMissingDataBehavior || 'INDETERMINATE',
        status: 'DRAFT',
      },
    });
    return { statusCode: HttpStatus.CREATED, data: version };
  }

  @Post('versions/:versionId/publish')
  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.DETECTION_MANAGE)
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
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const matches = await this.prisma.detectionMatch.findMany({
      where: { tenant_id: tenantId },
      take: limit ? Number(limit) : 50,
      orderBy: { detected_at: 'desc' },
    });
    return { statusCode: HttpStatus.OK, data: matches };
  }

  @Get('evaluations/:evaluationId')
  async getEvaluation(
    @Headers('x-tenant-id') tenantId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    const evaluation = await this.prisma.detectionEvaluation.findFirst({
      where: { id: evaluationId, tenant_id: tenantId },
    });
    if (!evaluation) {
      throw new NotFoundException(
        `DetectionEvaluation '${evaluationId}' not found`,
      );
    }
    return { statusCode: HttpStatus.OK, data: evaluation };
  }

  @Post('evaluations/:evaluationId/replay')
  async replay(
    @Headers('x-tenant-id') tenantId: string,
    @Param('evaluationId') evaluationId: string,
  ) {
    const replay = await this.replayService.replay(tenantId, evaluationId);
    return { statusCode: HttpStatus.OK, data: replay };
  }
}
