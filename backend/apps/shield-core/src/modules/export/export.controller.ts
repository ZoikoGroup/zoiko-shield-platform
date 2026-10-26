import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExportJobService } from './jobs/export-job.service';
import { ExportDownloadService } from './download/export-download.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
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
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body()
    body: {
      purpose: string;
      exportType: string;
      requestedScope: string[];
      formats?: string[];
      environmentId?: string;
    },
  ) {
    return this.exportJobService.create({
      tenantId: requireTenantId(tenantId),
      requestedBy: user.id,
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
    return this.exportJobService.list(requireTenantId(tenantId));
  }

  @Get(':exportId')
  async getById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('exportId') id: string,
  ) {
    return this.exportJobService.assertTenantOwnership(
      requireTenantId(tenantId),
      id,
    );
  }

  @Post(':exportId/cancel')
  async cancel(
    @Headers('x-tenant-id') tenantId: string,
    @Param('exportId') id: string,
  ) {
    return this.exportJobService.cancel(requireTenantId(tenantId), id);
  }

  @Get(':exportId/manifest')
  async manifest(
    @Headers('x-tenant-id') tenantId: string,
    @Param('exportId') id: string,
  ) {
    await this.exportJobService.assertTenantOwnership(
      requireTenantId(tenantId),
      id,
    );
    return this.prisma.exportManifest.findUnique({
      where: { export_job_id: id },
    });
  }

  @Get(':exportId/download')
  async download(
    @Headers('x-tenant-id') tenantId: string,
    @Param('exportId') id: string,
  ) {
    return this.downloadService.issueDownloadToken(
      requireTenantId(tenantId),
      id,
    );
  }

  @Get(':exportId/download/file')
  async downloadFile(
    @Headers('x-tenant-id') tenantId: string,
    @Param('exportId') id: string,
    @Res() res: Response,
  ) {
    const validTenantId = requireTenantId(tenantId);
    const job = await this.exportJobService.assertTenantOwnership(
      validTenantId,
      id,
    );
    const artifacts = await this.prisma.exportArtifact.findMany({
      where: { export_job_id: id, tenant_id: validTenantId },
    });
    const manifest = await this.prisma.exportManifest.findUnique({
      where: { export_job_id: id },
    });

    const exportPayload = {
      jobId: job.id,
      tenantId: validTenantId,
      exportType: job.export_type,
      purpose: job.purpose,
      status: job.status,
      completedAt: job.completed_at,
      manifest: manifest || null,
      artifacts: artifacts || [],
      generatedAt: new Date().toISOString(),
    };

    const filename = `zoikoshield-export-${id}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(JSON.stringify(exportPayload, null, 2));
  }

  @Get('data/:dataType')
  async exportData(
    @Headers('x-tenant-id') tenantId: string,
    @Param('dataType') dataType: string,
    @Query('format') format = 'json',
    @Res() res: Response,
  ) {
    const validTenantId = requireTenantId(tenantId);
    let records: any[] = [];
    const filename = `zoikoshield-${dataType}-${Date.now()}`;

    switch (dataType) {
      case 'team':
      case 'access':
        records = await this.prisma.tenantMembership.findMany({
          where: { tenantId: validTenantId },
          include: {
            roles: {
              include: {
                role: {
                  include: {
                    permissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        });
        break;
      case 'audit':
      case 'audit-logs':
        records = await this.prisma.auditPackage.findMany({
          where: { tenant_id: validTenantId },
        });
        break;
      case 'evidence':
        records = await this.prisma.evidenceRecord.findMany({
          where: { tenant_id: validTenantId },
        });
        break;
      case 'risk':
      case 'risks':
        records = await this.prisma.risk.findMany({
          where: { tenant_id: validTenantId },
        });
        break;
      case 'controls':
        records = await this.prisma.controlImplementation.findMany({
          where: { tenant_id: validTenantId },
        });
        break;
      case 'cases':
      case 'incidents':
        records = await this.prisma.case.findMany({
          where: { tenant_id: validTenantId },
        });
        break;
      case 'alerts':
        records = await this.prisma.alert.findMany({
          where: { tenant_id: validTenantId },
        });
        break;
      default:
        records = [];
    }

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      if (records.length === 0) {
        return res.status(200).send('id,status,createdAt\n');
      }
      const keys = Object.keys(records[0]).filter(k => typeof records[0][k] !== 'object');
      const csvHeader = keys.join(',');
      const csvRows = records.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','));
      return res.status(200).send([csvHeader, ...csvRows].join('\n'));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    return res.status(200).send(JSON.stringify(records, null, 2));
  }
}
