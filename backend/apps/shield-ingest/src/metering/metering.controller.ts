import { Controller, Get, Query, Headers, HttpStatus } from '@nestjs/common';
import { MeteringService } from './metering.service';
import { requireTenantId } from '../security/tenant-context';

@Controller('api/v1/metering')
export class MeteringController {
  constructor(private readonly meteringService: MeteringService) {}

  /**
   * GET /api/v1/metering/usage
   * Get telemetry usage breakdown and audit log
   */
  @Get('usage')
  async getUsageSummary(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const summary = await this.meteringService.getUsageSummary(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: summary,
    };
  }

  /**
   * GET /api/v1/metering/resources
   * Get protected resource inventory and coverage states
   */
  @Get('resources')
  async getResourceObservations(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const resources =
      await this.meteringService.getResourceObservations(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: resources,
    };
  }
}
