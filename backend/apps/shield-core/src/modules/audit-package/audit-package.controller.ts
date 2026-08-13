import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuditPackageService } from './audit-package.service';
import { AuditPackageBuilderService } from './builder/audit-package-builder.service';
import { AuditPackageValidatorService } from './validator/audit-package-validator.service';
import { AuditPackageApprovalService } from './approval/audit-package-approval.service';
import { AuditPackageFreezeService } from './freeze/audit-package-freeze.service';
import { AuditPackageSupersessionService } from './supersession/audit-package-supersession.service';
import { AuditPackageExportService } from './export/audit-package-export.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

@UseGuards(JwtAuthGuard, PermissionsGuard)
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
    return this.auditPackageService.list(requireTenantId(tenantId));
  }

  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      purpose: string;
      frameworkScope: string[];
      legalEntityScope?: string;
      environmentScope?: string;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    return this.auditPackageService.create({
      tenantId: requireTenantId(tenantId),
      createdBy: user.id,
      purpose: body.purpose,
      frameworkScope: body.frameworkScope,
      legalEntityScope: body.legalEntityScope,
      environmentScope: body.environmentScope,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
    });
  }

  @Get(':packageId')
  async getById(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.auditPackageService.assertTenantOwnership(
      requireTenantId(tenantId),
      packageId,
    );
  }

  @Post(':packageId/build')
  async build(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.builderService.build(requireTenantId(tenantId), packageId);
  }

  @Post([':packageId/validate', ':packageId/verify'])
  async validate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.validatorService.validate(requireTenantId(tenantId), packageId);
  }

  @Post(':packageId/approve')
  async approve(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.approvalService.approve(
      requireTenantId(tenantId),
      packageId,
      user.id,
    );
  }

  @Post(':packageId/freeze')
  async freeze(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.freezeService.freeze(requireTenantId(tenantId), packageId);
  }

  @Get(':packageId/manifest')
  async manifest(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.exportService.exportManifest(
      requireTenantId(tenantId),
      packageId,
    );
  }

  @Get(':packageId/evidence')
  async evidence(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    const manifest = await this.exportService.exportManifest(
      requireTenantId(tenantId),
      packageId,
    );
    return manifest.evidenceIndex;
  }

  @Get(':packageId/proofs')
  async proofs(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    const manifest = await this.exportService.exportManifest(
      requireTenantId(tenantId),
      packageId,
    );
    return (
      (manifest as { proofEnvelope?: unknown }).proofEnvelope ?? {
        status: 'NOT_FROZEN_YET',
      }
    );
  }

  @Post(':packageId/supersede')
  async supersede(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
  ) {
    return this.supersessionService.supersede(
      requireTenantId(tenantId),
      packageId,
      user.id,
    );
  }
}
