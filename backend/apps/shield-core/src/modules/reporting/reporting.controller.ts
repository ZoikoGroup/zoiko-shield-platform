import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { OperationalReportService } from './operational/operational-report.service';
import { ReportSnapshotService } from './snapshots/report-snapshot.service';
import { ExecutiveReportService } from './executive/executive-report.service';

@Controller('api/v1/reporting')
export class ReportingController {
  constructor(
    private readonly operationalReportService: OperationalReportService,
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly executiveReportService: ExecutiveReportService,
  ) {}

  @Get('operational')
  async operational(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getSecuritySummary(tenantId ?? 'default-tenant');
  }

  @Get('security')
  async security(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getSecuritySummary(tenantId ?? 'default-tenant');
  }

  @Get('assurance')
  async assurance(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getAssuranceSummary(tenantId ?? 'default-tenant');
  }

  @Get('service-health')
  async serviceHealth(@Headers('x-tenant-id') tenantId: string) {
    return this.operationalReportService.getServiceHealthSummary(tenantId ?? 'default-tenant');
  }

  @Post('snapshots')
  async createSnapshot(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Body() body: { reportDefinitionId: string; periodStart: string; periodEnd: string; environmentId?: string },
  ) {
    return this.reportSnapshotService.build({
      tenantId: tenantId ?? 'default-tenant',
      generatedBy: actorId ?? 'unknown-actor',
      reportDefinitionId: body.reportDefinitionId,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      environmentId: body.environmentId,
    });
  }

  @Get('snapshots/:snapshotId')
  async getSnapshot(@Headers('x-tenant-id') tenantId: string, @Param('snapshotId') snapshotId: string) {
    return this.reportSnapshotService.getById(tenantId ?? 'default-tenant', snapshotId);
  }

  @Post('executive/snapshots')
  async createExecutiveSnapshot(@Headers('x-tenant-id') tenantId: string, @Body() body: { reportSnapshotId: string; reportingPeriod: string }) {
    return this.executiveReportService.createFromSnapshot(tenantId ?? 'default-tenant', body.reportSnapshotId, body.reportingPeriod);
  }
}
