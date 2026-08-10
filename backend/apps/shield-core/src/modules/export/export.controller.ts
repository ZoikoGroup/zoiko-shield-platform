import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ExportJobService } from './jobs/export-job.service';
import { ExportDownloadService } from './download/export-download.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/v1/exports')
export class ExportController {
  constructor(
    private readonly exportJobService: ExportJobService,
    private readonly downloadService: ExportDownloadService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: { purpose: string; exportType: string; requestedScope: string[]; formats?: string[]; environmentId?: string },
  ) {
    return this.exportJobService.create({
      tenantId: tenantId ?? 'default-tenant',
      requestedBy: actorId ?? 'unknown-actor',
      purpose: body.purpose,
      exportType: body.exportType,
      requestedScope: body.requestedScope,
      formats: body.formats,
      environmentId: body.environmentId,
      idempotencyKey,
    });
  }

  @Get()
  async list(@Headers('x-tenant-id') tenantId: string) {
    return this.exportJobService.list(tenantId ?? 'default-tenant');
  }

  @Get(':exportId')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('exportId') id: string) {
    return this.exportJobService.assertTenantOwnership(tenantId ?? 'default-tenant', id);
  }

  @Post(':exportId/cancel')
  async cancel(@Headers('x-tenant-id') tenantId: string, @Param('exportId') id: string) {
    return this.exportJobService.cancel(tenantId ?? 'default-tenant', id);
  }

  @Get(':exportId/manifest')
  async manifest(@Headers('x-tenant-id') tenantId: string, @Param('exportId') id: string) {
    await this.exportJobService.assertTenantOwnership(tenantId ?? 'default-tenant', id);
    return this.prisma.exportManifest.findUnique({ where: { export_job_id: id } });
  }

  @Get(':exportId/download')
  async download(@Headers('x-tenant-id') tenantId: string, @Param('exportId') id: string) {
    return this.downloadService.issueDownloadToken(tenantId ?? 'default-tenant', id);
  }
}
