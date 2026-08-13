import { Controller, Get, Query, Headers, HttpStatus } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { requireTenantId } from '../security/tenant-context';

@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard/overview
   */
  @Get('overview')
  async getOverview(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const overview = await this.dashboardService.getOverview(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: overview,
    };
  }

  /**
   * GET /api/v1/dashboard/connectors
   */
  @Get('connectors')
  async getConnectorMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const metrics = await this.dashboardService.getConnectorMetrics(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: metrics,
    };
  }

  /**
   * GET /api/v1/dashboard/events
   */
  @Get('events')
  async getEventMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const metrics = await this.dashboardService.getEventMetrics(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: metrics,
    };
  }

  /**
   * GET /api/v1/dashboard/alerts
   */
  @Get('alerts')
  async getAlertMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const metrics = await this.dashboardService.getAlertMetrics(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: metrics,
    };
  }

  /**
   * GET /api/v1/dashboard/cases
   */
  @Get('cases')
  async getCaseMetrics(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const metrics = await this.dashboardService.getCaseMetrics(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: metrics,
    };
  }

  /**
   * GET /api/v1/dashboard/control-health
   */
  @Get('control-health')
  async getControlHealth(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const health = await this.dashboardService.getControlHealth(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: health,
    };
  }

  /**
   * GET /api/v1/dashboard/evidence-health
   */
  @Get('evidence-health')
  async getEvidenceHealth(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = requireTenantId(headerTenantId, queryTenantId);
    const health = await this.dashboardService.getEvidenceHealth(tenantId);
    return {
      statusCode: HttpStatus.OK,
      data: health,
    };
  }
}
