import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { RequireAssurance } from '../../authorization/decorators/require-assurance.decorator';
import { PERMISSION_CODES } from '../../authorization/constants';
import { requireTenantId } from '../../../tenant-context';
import { AirgapCompliancePackageService } from './airgap-compliance-package.service';

export class ExportAirgapPackageDto {
  @IsString()
  packageId!: string;

  @IsOptional()
  @IsBoolean()
  includeEmbeddedCertificates?: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
@Controller('api/v1/compliance/airgap')
export class AirgapComplianceController {
  constructor(private readonly airgapService: AirgapCompliancePackageService) {}

  /**
   * POST /api/v1/compliance/airgap/export-package
   * Exports a self-contained, signed compliance package bundle for zero-connectivity airgap verification.
   */
  @Post('export-package')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_WRITE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async exportPackage(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Body() dto: ExportAirgapPackageDto,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const bundle = await this.airgapService.exportAirgapPackage(
      tenantId,
      dto.packageId,
      dto.includeEmbeddedCertificates ?? true,
    );

    return {
      statusCode: HttpStatus.OK,
      data: bundle,
    };
  }

  /**
   * GET /api/v1/compliance/airgap/packages/:bundleId
   * Retrieves an exported airgap package bundle.
   */
  @Get('packages/:bundleId')
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  async getBundle(
    @Headers('x-tenant-id') tenantIdHeader: string,
    @Param('bundleId') bundleId: string,
  ) {
    const tenantId = requireTenantId(tenantIdHeader);
    const bundle = await this.airgapService.getAirgapBundle(tenantId, bundleId);

    return {
      statusCode: HttpStatus.OK,
      data: bundle,
    };
  }
}
