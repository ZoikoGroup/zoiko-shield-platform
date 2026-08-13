import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OperationalReportService } from './operational/operational-report.service';
import { ReportSnapshotService } from './snapshots/report-snapshot.service';
import { ExecutiveReportService } from './executive/executive-report.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/reporting')
export class ReportingController {
  constructor(
    private readonly operationalReportService: OperationalReportService,
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly executiveReportService: ExecutiveReportService,
  ) {}

  @Get('operational')
  async operational(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getSecuritySummary(
      requireTenantId(tenantId),
    );
  }

  @Get('security')
  async security(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getSecuritySummary(
      requireTenantId(tenantId),
    );
  }

  @Get('assurance')
  async assurance(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getAssuranceSummary(
      requireTenantId(tenantId),
    );
  }

  @Get('service-health')
  async serviceHealth(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getServiceHealthSummary(
      requireTenantId(tenantId),
    );
  }

  @Post('snapshots')
  async createSnapshot(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      reportDefinitionId: string;
      periodStart: string;
      periodEnd: string;
      environmentId?: string;
    },
  ) {
    return this.reportSnapshotService.build({
      tenantId: requireTenantId(tenantId),
      generatedBy: user.id,
      reportDefinitionId: body.reportDefinitionId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      environmentId: body.environmentId,
    });
  }

  @Get('snapshots/:snapshotId')
  async getSnapshot(
    @Headers('x-tenant-id') tenantId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.reportSnapshotService.getById(
      requireTenantId(tenantId),
      snapshotId,
    );
  }

  @Post('executive/snapshots')
  async createExecutiveSnapshot(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { reportSnapshotId: string; reportingPeriod: string },
  ) {
    return this.executiveReportService.createFromSnapshot(
      requireTenantId(tenantId),
      body.reportSnapshotId,
      body.reportingPeriod,
    );
  }
}
