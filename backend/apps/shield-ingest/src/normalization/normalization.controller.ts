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
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
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
  async getNormalizedEventById(@Param('eventId') eventId: string) {
    const event = await this.normalizationService.getNormalizedEventById(eventId);
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
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
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
  async reprocessQuarantinedEvent(@Param('eventId') quarantineId: string) {
    const result = await this.normalizationService.reprocessQuarantinedEvent(quarantineId);
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
    const tenantId = headerTenantId || body.tenantId || 'default-tenant';
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
