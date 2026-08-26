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
import { AuditPackageClaimService } from './claim/audit-package-claim.service';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { IsDefined, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { HumanAuthorityAttestationDto } from '../human-authority/human-authority.dto';
import { RequireHumanAuthority } from '../human-authority/human-authority.decorator';
import { HumanAuthorityGuard } from '../human-authority/human-authority.guard';

export class ApproveAuditPackageDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => HumanAuthorityAttestationDto)
  humanAuthority!: HumanAuthorityAttestationDto;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
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
    private readonly claimService: AuditPackageClaimService,
  ) {}

  @Get()
  async list(@Headers('x-tenant-id') tenantId: string) {
    return this.auditPackageService.list(requireTenantId(tenantId));
  }

  @Post()
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      purpose: string;
      continuousAssuranceProfileId: string;
      frameworkScope: string[];
      legalEntityScope?: string;
      environmentScope?: string;
      periodStart: string;
      periodEnd: string;
      retentionUntil: string;
      auditCycleReference: string;
    },
  ) {
    return this.auditPackageService.create({
      tenantId: requireTenantId(tenantId),
      createdBy: user.id,
      continuousAssuranceProfileId: body.continuousAssuranceProfileId,
      purpose: body.purpose,
      frameworkScope: body.frameworkScope,
      legalEntityScope: body.legalEntityScope,
      environmentScope: body.environmentScope,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      retentionUntil: new Date(body.retentionUntil),
      auditCycleReference: body.auditCycleReference,
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
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async build(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.builderService.build(requireTenantId(tenantId), packageId);
  }

  @Post([':packageId/validate', ':packageId/verify'])
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async validate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.validatorService.validate(requireTenantId(tenantId), packageId);
  }

  @Post(':packageId/approve')
  @UseGuards(HumanAuthorityGuard)
  @RequireHumanAuthority('COMPLIANCE_CONCLUSION', 'AuditPackage', 'packageId')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async approve(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('packageId') packageId: string,
    @Body() _dto: ApproveAuditPackageDto,
  ) {
    return this.approvalService.approve(
      requireTenantId(tenantId),
      packageId,
      user.id,
    );
  }

  @Post(':packageId/freeze')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
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

  @Get(':packageId/claim-eligibility')
  async claimEligibility(
    @Headers('x-tenant-id') tenantId: string,
    @Param('packageId') packageId: string,
  ) {
    return this.claimService.get(requireTenantId(tenantId), packageId);
  }

  @Post(':packageId/supersede')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
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
