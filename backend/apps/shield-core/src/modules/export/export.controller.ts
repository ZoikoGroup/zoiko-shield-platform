import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
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
}
