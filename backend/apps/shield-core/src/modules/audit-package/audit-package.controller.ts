import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AuditPackageService } from './audit-package.service';
import { AuditPackageBuilderService } from './builder/audit-package-builder.service';
import { AuditPackageValidatorService } from './validator/audit-package-validator.service';
import { AuditPackageApprovalService } from './approval/audit-package-approval.service';
import { AuditPackageFreezeService } from './freeze/audit-package-freeze.service';
import { AuditPackageSupersessionService } from './supersession/audit-package-supersession.service';
import { AuditPackageExportService } from './export/audit-package-export.service';

@Controller('api/v1/audit-packages')
export class AuditPackageController {
  constructor(
    private readonly auditPackageService: AuditPackageService,
    private readonly builderService: AuditPackageBuilderService,
    private readonly validatorService: AuditPackageValidatorService,
    private readonly approvalService: AuditPackageApprovalService,
    private readonly freezeService: AuditPackageFreezeService,
    private readonly supersessionService: AuditPackageSupersessionService,
    private readonly exportService: AuditPackageExportService,
  ) {}

  @Get()
  async list(@Headers('x-tenant-id') tenantId: string) {
    return this.auditPackageService.list(tenantId ?? 'default-tenant');
  }

  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-actor-id') actorId: string,
    @Body() body: { purpose: string; frameworkScope: string[]; legalEntityScope?: string; environmentScope?: string; periodStart: string; periodEnd: string },
  ) {
    return this.auditPackageService.create({
      tenantId: tenantId ?? 'default-tenant',
      createdBy: actorId ?? 'unknown-actor',
      purpose: body.purpose,
      frameworkScope: body.frameworkScope,
      legalEntityScope: body.legalEntityScope,
      environmentScope: body.environmentScope,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
    });
  }

  @Get(':packageId')
  async getById(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    return this.auditPackageService.assertTenantOwnership(tenantId ?? 'default-tenant', packageId);
  }

  @Post(':packageId/build')
  async build(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    return this.builderService.build(tenantId ?? 'default-tenant', packageId);
  }

  @Post([':packageId/freeze', ':packageId/finalize'])
  async freeze(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    return this.freezeService.freeze(tenantId ?? 'default-tenant', packageId);
  }

  @Get(':packageId/export')
  async exportPackage(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    const manifest = await this.exportService.exportManifest(tenantId ?? 'default-tenant', packageId);
    return {
      statusCode: 200,
      filename: `audit-package-${packageId}.zip`,
      manifest,
      downloadUrl: `/api/v1/audit-packages/${packageId}/manifest`,
    };
  }

  @Post([':packageId/validate', ':packageId/verify'])
  async validate(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    return this.validatorService.validate(tenantId ?? 'default-tenant', packageId);
  }

  @Get(':packageId/manifest')
  async manifest(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    return this.exportService.exportManifest(tenantId ?? 'default-tenant', packageId);
  }

  @Get(':packageId/evidence')
  async evidence(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    const manifest = await this.exportService.exportManifest(tenantId ?? 'default-tenant', packageId);
    return manifest.evidenceIndex;
  }

  @Get(':packageId/proofs')
  async proofs(@Headers('x-tenant-id') tenantId: string, @Param('packageId') packageId: string) {
    const manifest = await this.exportService.exportManifest(tenantId ?? 'default-tenant', packageId);
    return (manifest as { proofEnvelope?: unknown }).proofEnvelope ?? { status: 'NOT_FROZEN_YET' };
  }

  @Post(':packageId/supersede')
  async supersede(@Headers('x-tenant-id') tenantId: string, @Headers('x-actor-id') actorId: string, @Param('packageId') packageId: string) {
    return this.supersessionService.supersede(tenantId ?? 'default-tenant', packageId, actorId ?? 'unknown-actor');
  }
}
