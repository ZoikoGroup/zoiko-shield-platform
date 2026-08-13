import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { NormalizationService } from './normalization.service';
import { requireTenantId } from '../security/tenant-context';

export class ReplayQueryDto {
  tenantId?: string;
  connectorId?: string;
}

@Controller('api/v1')
export class NormalizationController {
  constructor(private readonly normalizationService: NormalizationService) {}

  /**
   * GET /api/v1/events
   * Query normalized events for tenant
   */
  @Get('events')
  async getNormalizedEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const events = await this.normalizationService.getNormalizedEvents(
      tenantId,
      limit ? Number(limit) : 50,
    );
    return {
      statusCode: HttpStatus.OK,
      data: events,
    };
  }

  /**
   * GET /api/v1/events/:eventId
   * Get single normalized event record
   */
  @Get('events/:eventId')
  async getNormalizedEventById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('eventId') eventId: string,
  ) {
    const event = await this.normalizationService.getNormalizedEventById(
      requireTenantId(headerTenantId),
      eventId,
    );
    return {
      statusCode: HttpStatus.OK,
      data: event,
    };
  }

  /**
   * GET /api/v1/quarantine
   * Query quarantined events for tenant
   */
  @Get('quarantine')
  async getQuarantinedEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const quarantined = await this.normalizationService.getQuarantinedEvents(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: quarantined,
    };
  }

  /**
   * POST /api/v1/quarantine/:eventId/reprocess
   * Reprocess a quarantined event
   */
  @Post('quarantine/:eventId/reprocess')
  async reprocessQuarantinedEvent(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('eventId') quarantineId: string,
  ) {
    const result = await this.normalizationService.reprocessQuarantinedEvent(
      requireTenantId(headerTenantId),
      quarantineId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Quarantine reprocessed',
      data: result,
    };
  }

  /**
   * POST /api/v1/events/replay
   * Idempotent replay of raw events
   */
  @Post('events/replay')
  async replayEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @Body() body: ReplayQueryDto,
  ) {
    const tenantId = requireTenantId(headerTenantId, body.tenantId);
    const result = await this.normalizationService.replayEvents(
      tenantId,
      body.connectorId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Event replay execution completed',
      data: result,
    };
  }
}
