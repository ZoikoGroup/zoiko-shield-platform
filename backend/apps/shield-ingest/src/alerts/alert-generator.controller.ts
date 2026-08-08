import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Headers,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { AlertGeneratorService } from './alert-generator.service';

export class UpdateAlertStatusDto {
  status!: string;
}

export class AssignAlertDto {
  userId!: string;
}

@Controller('api/v1/alerts')
export class AlertGeneratorController {
  constructor(private readonly alertService: AlertGeneratorService) {}

  /**
   * GET /api/v1/alerts
   * List alerts for a tenant
   */
  @Get()
  async getAlerts(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = headerTenantId || queryTenantId || 'default-tenant';
    const alerts = await this.alertService.getAlerts(
      tenantId,
      status,
      severity,
      limit ? Number(limit) : 50,
    );
    return {
      statusCode: HttpStatus.OK,
      data: alerts,
    };
  }

  /**
   * GET /api/v1/alerts/:alertId
   * Get detailed alert information
   */
  @Get(':alertId')
  async getAlertById(@Param('alertId') alertId: string) {
    const alert = await this.alertService.getAlertById(alertId);
    return {
      statusCode: HttpStatus.OK,
      data: alert,
    };
  }

  /**
   * PATCH /api/v1/alerts/:alertId/status
   * Update alert status
   */
  @Patch(':alertId/status')
  async updateAlertStatus(
    @Param('alertId') alertId: string,
    @Body() dto: UpdateAlertStatusDto,
  ) {
    const alert = await this.alertService.updateAlertStatus(alertId, dto.status);
    return {
      statusCode: HttpStatus.OK,
      message: 'Alert status updated',
      data: alert,
    };
  }

  /**
   * POST /api/v1/alerts/:alertId/assign
   * Assign alert to analyst
   */
  @Post(':alertId/assign')
  async assignAlert(
    @Param('alertId') alertId: string,
    @Body() dto: AssignAlertDto,
  ) {
    const alert = await this.alertService.assignAlert(alertId, dto.userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Alert assigned successfully',
      data: alert,
    };
  }

  /**
   * POST /api/v1/alerts/:alertId/create-case
   * Promote alert to case candidate payload
   */
  @Post(':alertId/create-case')
  async createCaseFromAlert(@Param('alertId') alertId: string) {
    const result = await this.alertService.promoteAlertToCase(alertId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Alert promoted to case',
      data: result,
    };
  }
}
