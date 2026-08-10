import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { CreateResourceDefinitionDto, ProtectedResourceDefinitionService } from './protected-resource-definition.service';
import { RecordObservationDto, ResourceObservationService } from './resource-observation.service';

/** Admin-curated: humans define and approve resource identity/dedup rules. */
@UseGuards(JwtAuthGuard)
@Controller('api/v1/resources/definitions')
export class ResourceDefinitionController {
  constructor(private readonly definitionService: ProtectedResourceDefinitionService) {}

  @Post()
  async create(@Body() dto: CreateResourceDefinitionDto) {
    const definition = await this.definitionService.createDefinition(dto);
    return { statusCode: HttpStatus.CREATED, data: definition };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    const definition = await this.definitionService.approveDefinition(id, approvedBy || 'system');
    return { statusCode: HttpStatus.OK, data: definition };
  }
}

/**
 * Observations are written by the connector ingestion pipeline
 * (shield-ingest / shield-ai), not an interactive user session — guarded
 * with the same shared-secret InternalAuthGuard already used for other
 * service-to-service endpoints in this app.
 */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/resources/observations')
export class ResourceObservationController {
  constructor(private readonly observationService: ResourceObservationService) {}

  @Post()
  async record(@Body() dto: RecordObservationDto) {
    const result = await this.observationService.recordObservation(dto);
    return { statusCode: HttpStatus.CREATED, data: result };
  }

  @Get()
  async list(@Query('tenantId') tenantId: string) {
    const observations = await this.observationService.listByTenant(tenantId);
    return { statusCode: HttpStatus.OK, data: observations };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const observation = await this.observationService.getObservationById(id);
    return { statusCode: HttpStatus.OK, data: observation };
  }

  @Patch(':id/coverage-state')
  async updateCoverageState(
    @Param('id') id: string,
    @Body('targetState') targetState: string,
    @Body('exclusionReason') exclusionReason?: string,
  ) {
    const observation = await this.observationService.updateCoverageState(id, targetState, exclusionReason);
    return { statusCode: HttpStatus.OK, data: observation };
  }
}
