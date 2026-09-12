import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpStatus,
  HttpCode,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { InternalAuthGuard } from '../internal-client/internal-auth.guard';
import { AiIncidentService } from './ai-incident.service';
import {
  DeclareAiIncidentDto,
  ContainIncidentDto,
  FallbackIncidentDto,
  CompleteRcaDto,
  ResolveIncidentDto,
  AiIncidentStatus,
  AiIncidentSeverity,
  AiIncidentCategory,
} from './dto/declare-incident.dto';

@UseGuards(InternalAuthGuard)
@Controller('api/v1/ai/incidents')
export class AiIncidentController {
  constructor(private readonly incidentService: AiIncidentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async declareIncident(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string | undefined,
    @Body() dto: DeclareAiIncidentDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const incident = await this.incidentService.declareIncident(
      tenantId,
      dto,
      actorId || 'system',
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'AI incident declared successfully',
      data: incident,
    };
  }

  @Get()
  async listIncidents(
    @Headers('x-tenant-id') tenantId: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const data = await this.incidentService.listIncidents(tenantId, {
      status: status as any,
      severity: severity as any,
      category: category as any,
    });
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Get('metrics')
  async getMetrics(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const data = await this.incidentService.getMetrics(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Get(':id')
  async getIncident(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const data = await this.incidentService.getIncident(tenantId, id);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Post(':id/contain')
  @HttpCode(HttpStatus.OK)
  async containIncident(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string | undefined,
    @Param('id') id: string,
    @Body() dto: ContainIncidentDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const incident = await this.incidentService.containIncident(
      tenantId,
      id,
      dto,
      actorId || 'soc-operator',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'AI incident contained via kill switch',
      data: incident,
    };
  }

  @Post(':id/fallback')
  @HttpCode(HttpStatus.OK)
  async activateFallback(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string | undefined,
    @Param('id') id: string,
    @Body() dto: FallbackIncidentDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const incident = await this.incidentService.activateFallback(
      tenantId,
      id,
      dto,
      actorId || 'soc-operator',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Fallback active for AI incident',
      data: incident,
    };
  }

  @Post(':id/rca')
  @HttpCode(HttpStatus.OK)
  async completeRca(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string | undefined,
    @Param('id') id: string,
    @Body() dto: CompleteRcaDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const incident = await this.incidentService.completeRca(
      tenantId,
      id,
      dto,
      actorId || 'ai-safety-engineer',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'RCA completed for AI incident',
      data: incident,
    };
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveIncident(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string | undefined,
    @Param('id') id: string,
    @Body() dto: ResolveIncidentDto,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const incident = await this.incidentService.resolveIncident(
      tenantId,
      id,
      dto,
      actorId || 'soc-lead',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'AI incident resolved',
      data: incident,
    };
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  async closeIncident(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string | undefined,
    @Param('id') id: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }
    const incident = await this.incidentService.closeIncident(
      tenantId,
      id,
      actorId || 'soc-lead',
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'AI incident closed',
      data: incident,
    };
  }
}
