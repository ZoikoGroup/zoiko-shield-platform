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
  UseGuards,
} from '@nestjs/common';
import { AlertService } from '../services/alert.service';
import { AlertAssignmentService } from '../assignment/alert-assignment.service';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { CurrentUser } from '../../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { requireTenantId } from '../../../tenant-context';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { AlertStatus } from '../state-machine/alert-state-machine.service';

// Keyed by the AlertStatus union so adding a status there without adding it
// here is a compile error.
const ALERT_STATUS_KEYS: Record<AlertStatus, true> = {
  NEW: true,
  ACKNOWLEDGED: true,
  TRIAGED: true,
  FALSE_POSITIVE: true,
  DUPLICATE: true,
  SUPPRESSED: true,
  ESCALATED_TO_CASE: true,
  CLOSED: true,
};
const ALERT_STATUSES = Object.keys(ALERT_STATUS_KEYS) as AlertStatus[];

// The global ValidationPipe runs with whitelist: true, which strips every
// property that carries no class-validator decorator.
export class UpdateAlertStatusDto {
  @IsIn(ALERT_STATUSES)
  status!: string;
}

/**
 * POST :alertId/close takes an optional disposition: AlertService.close()
 * defaults to CLOSED when none is given, so the field cannot be required here
 * the way it is for PATCH :alertId/status.
 */
export class CloseAlertDto {
  @IsOptional()
  @IsIn(ALERT_STATUSES)
  status?: string;
}

export class AssignAlertDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  principalId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  queueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/alerts')
export class AlertController {
  constructor(
    private readonly alertService: AlertService,
    private readonly assignmentService: AlertAssignmentService,
  ) {}

  private resolveTenantId(
    headerTenantId: string,
    queryTenantId?: string,
  ): string {
    return requireTenantId(headerTenantId, queryTenantId);
  }

  @Get()
  async getAlerts(
    @Headers('x-tenant-id') headerTenantId: string,
    @Query('tenantId') queryTenantId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: number,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId, queryTenantId);
    const alerts = await this.alertService.getAlerts(
      tenantId,
      status,
      severity,
      limit ? Number(limit) : 50,
    );
    return { statusCode: HttpStatus.OK, data: alerts };
  }

  @Get(':alertId')
  async getAlertById(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
  ) {
    const alert = await this.alertService.getAlertById(
      this.resolveTenantId(headerTenantId),
      alertId,
    );
    return { statusCode: HttpStatus.OK, data: alert };
  }

  /**
   * W14 (Alert detail): the rule and version that fired, the factors it
   * computed, the context resolved at the time, and the evidence and case it
   * produced. GET :alertId returns the bare row, which cannot explain itself.
   */
  @Get(':alertId/detail')
  async getAlertDetail(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
  ) {
    const detail = await this.alertService.getAlertDetail(
      this.resolveTenantId(headerTenantId),
      alertId,
    );
    return { statusCode: HttpStatus.OK, data: detail };
  }

  @Patch(':alertId/status')
  async updateStatus(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
    @Body() dto: UpdateAlertStatusDto,
  ) {
    const alert = await this.alertService.updateStatus(
      this.resolveTenantId(headerTenantId),
      alertId,
      dto.status,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Alert status updated',
      data: alert,
    };
  }

  @Post(':alertId/acknowledge')
  async acknowledge(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
  ) {
    const alert = await this.alertService.acknowledge(
      this.resolveTenantId(headerTenantId),
      alertId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Alert acknowledged',
      data: alert,
    };
  }

  @Post(':alertId/assign')
  async assign(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
    @Body() dto: AssignAlertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const tenantId = this.resolveTenantId(headerTenantId);
    const assignment = await this.assignmentService.assign({
      tenantId,
      alertId,
      principalId: dto.principalId,
      queueId: dto.queueId,
      assignedBy: user.id,
      reason: dto.reason,
    });
    return {
      statusCode: HttpStatus.OK,
      message: 'Alert assigned',
      data: assignment,
    };
  }

  @Post(':alertId/triage')
  async triage(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
  ) {
    const alert = await this.alertService.triage(
      this.resolveTenantId(headerTenantId),
      alertId,
    );
    return { statusCode: HttpStatus.OK, message: 'Alert triaged', data: alert };
  }

  @Post(':alertId/escalate')
  async escalate(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
  ) {
    const alert = await this.alertService.escalate(
      this.resolveTenantId(headerTenantId),
      alertId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Alert escalated',
      data: alert,
    };
  }

  @Post(':alertId/close')
  async close(
    @Headers('x-tenant-id') headerTenantId: string,
    @Param('alertId') alertId: string,
    @Body() dto: CloseAlertDto,
  ) {
    const alert = await this.alertService.close(
      this.resolveTenantId(headerTenantId),
      alertId,
      dto.status as any,
    );
    return { statusCode: HttpStatus.OK, message: 'Alert closed', data: alert };
  }
}
