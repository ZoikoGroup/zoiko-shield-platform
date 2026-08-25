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
import { InternalAuthGuard } from '../../internal-client/internal-auth.guard';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  CreateManagedDefenseProfileDto,
  DecideManagedDefenseDto,
  ManagedDefenseService,
  OpenCapacityExceptionDto,
  ReconcileCapacityExceptionDto,
  RecordCapabilityImpactDto,
  RecordManagedDefenseDeliveryDto,
  VerifyManagedDefenseReadinessDto,
} from './managed-defense.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/managed-defense')
export class ManagedDefenseController {
  constructor(private readonly managedDefense: ManagedDefenseService) {}

  private boundary(headerTenantId: string, user: AuthenticatedUser) {
    return {
      tenantId: requireTenantId(headerTenantId),
      environmentId: requireEnvironmentId(user.environmentId),
    };
  }

  @Get('profiles')
  async listProfiles(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.listProfiles(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('profiles/:id')
  async getProfile(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.getProfile(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Post('profiles')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async createProfile(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManagedDefenseProfileDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.managedDefense.createProfile(
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Patch('profiles/:id/decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decideProfile(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideManagedDefenseDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.decideProfile(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get('profiles/:id/delivery-events')
  async deliveryEvents(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.listDeliveryEvents(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('profiles/:id/delivery-summary')
  async deliverySummary(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.deliverySummary(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('capacity-exceptions')
  async capacityExceptions(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.listCapacityExceptions(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Patch('capacity-exceptions/:id/paid-work-decision')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_APPROVE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async decidePaidOverflow(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideManagedDefenseDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.decidePaidOverflow(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Post('capacity-exceptions/:id/reconciliation')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async reconcileCapacity(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReconcileCapacityExceptionDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.reconcileCapacityException(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }

  @Get('capability-impacts')
  async capabilityImpacts(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.listCapabilityImpacts(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }
}

@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(
  PERMISSION_CODES.PLATFORM_COMMERCIAL_READINESS_VERIFY,
)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/platform/managed-defense')
export class PlatformManagedDefenseController {
  constructor(private readonly managedDefense: ManagedDefenseService) {}

  @Patch('profiles/:id/readiness')
  async verifyReadiness(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
    @Query('environmentId') environmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyManagedDefenseReadinessDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.verifyReadiness(
        id,
        requireTenantId(tenantId),
        requireEnvironmentId(environmentId),
        user.id,
        dto,
      ),
    };
  }
}

/** Security-plane observations can record delivery/degradation, never prices or credits. */
@UseGuards(InternalAuthGuard)
@Controller('api/v1/internal/managed-defense')
export class InternalManagedDefenseController {
  constructor(private readonly managedDefense: ManagedDefenseService) {}

  private boundary(tenantId: string, environmentId: string) {
    return {
      tenantId: requireTenantId(tenantId),
      environmentId: requireEnvironmentId(environmentId),
    };
  }

  @Post('delivery-events')
  async recordDelivery(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-environment-id') environmentId: string,
    @Body() dto: RecordManagedDefenseDeliveryDto,
  ) {
    const boundary = this.boundary(tenantId, environmentId);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.managedDefense.recordDelivery(
        boundary.tenantId,
        boundary.environmentId,
        dto,
      ),
    };
  }

  @Post('capacity-exceptions')
  async openCapacityException(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-environment-id') environmentId: string,
    @Headers('x-service-principal-id') servicePrincipalId: string,
    @Body() dto: OpenCapacityExceptionDto,
  ) {
    const boundary = this.boundary(tenantId, environmentId);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.managedDefense.openCapacityException(
        boundary.tenantId,
        boundary.environmentId,
        servicePrincipalId || 'internal:managed-defense',
        dto,
      ),
    };
  }

  @Post('capability-impacts')
  async recordCapabilityImpact(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-environment-id') environmentId: string,
    @Body() dto: RecordCapabilityImpactDto,
  ) {
    const boundary = this.boundary(tenantId, environmentId);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.managedDefense.recordCapabilityImpact(
        boundary.tenantId,
        boundary.environmentId,
        dto,
      ),
    };
  }

  @Patch('capability-impacts/:id/resolve')
  async resolveCapabilityImpact(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-environment-id') environmentId: string,
    @Param('id') id: string,
  ) {
    const boundary = this.boundary(tenantId, environmentId);
    return {
      statusCode: HttpStatus.OK,
      data: await this.managedDefense.resolveCapabilityImpact(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }
}
