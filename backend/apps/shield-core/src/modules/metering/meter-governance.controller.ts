import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  CreateMeterAuthorizationPolicyDto,
  CreateMeterBillingExportDto,
  CreateMeterCorrectionDto,
  CreateMeterUsageAuthorizationDto,
  DecideMeterGovernanceDto,
  MeterGovernanceService,
} from './meter-governance.service';
import { MeteringService } from './metering.service';

/** Customer-visible meter authority, evidence, forecasts and billing exports. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/metering')
export class MeterGovernanceController {
  constructor(
    private readonly governance: MeterGovernanceService,
    private readonly metering: MeteringService,
  ) {}

  private boundary(headerTenantId: string, user: AuthenticatedUser) {
    return {
      tenantId: requireTenantId(headerTenantId),
      environmentId: requireEnvironmentId(user.environmentId),
    };
  }

  @Get('policies')
  async listPolicies(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.listPolicies(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('policies/:id')
  async getPolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.getPolicy(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Post('policies')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async createPolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMeterAuthorizationPolicyDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.governance.createPolicy(
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch('policies/:id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decidePolicy(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideMeterGovernanceDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.decidePolicy(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get('policies/:id/usage-summary')
  async usageSummary(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.usageSummary(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('threshold-events')
  async thresholdEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.listThresholds(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('events')
  async listEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.metering.listEvents(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('events/:id')
  async getEvent(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.metering.getEvent(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('events/:id/lineage')
  async lineage(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.metering.correctionLineage(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('usage-authorizations')
  async usageAuthorizations(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.listUsageAuthorizations(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Post('usage-authorizations')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async createUsageAuthorization(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMeterUsageAuthorizationDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.governance.createUsageAuthorization(
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch('usage-authorizations/:id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideUsageAuthorization(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideMeterGovernanceDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.decideUsageAuthorization(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get('corrections')
  async corrections(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.listCorrections(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Post('corrections')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async createCorrection(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMeterCorrectionDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.governance.createCorrection(
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch('corrections/:id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideCorrection(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideMeterGovernanceDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.decideCorrection(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get('billing-exports')
  async billingExports(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.listBillingExports(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Post('billing-exports')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async createBillingExport(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMeterBillingExportDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.governance.createBillingExport(
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch('billing-exports/:id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideBillingExport(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideMeterGovernanceDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.decideBillingExport(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get('billing-exports/:id/reconciliation')
  async reconcileBillingExport(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.reconcileBillingExport(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }
}

/** Cross-tenant operational visibility for the platform metering authority. */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_METER_DEFINITION_MANAGE)
@Controller('api/v1/platform/metering')
export class PlatformMeterGovernanceController {
  constructor(private readonly governance: MeterGovernanceService) {}

  private boundary(tenantId: string, environmentId: string) {
    return {
      tenantId: requireTenantId(tenantId),
      environmentId: requireEnvironmentId(environmentId),
    };
  }

  @Get('policies')
  async listPolicies(
    @Query('tenantId') tenantId: string,
    @Query('environmentId') environmentId: string,
  ) {
    const boundary = this.boundary(tenantId, environmentId);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.listPolicies(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('policies/:id/usage-summary')
  async usageSummary(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Query('environmentId') environmentId: string,
  ) {
    const boundary = this.boundary(tenantId, environmentId);
    return {
      statusCode: HttpStatus.OK,
      data: await this.governance.usageSummary(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }
}
