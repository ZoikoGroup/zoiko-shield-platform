import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { requireEnvironmentId, requireTenantId } from '../../tenant-context';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  ContinuousAssuranceService,
  CreateContinuousAssuranceProfileDto,
  DecideContinuousAssuranceProfileDto,
} from './continuous-assurance.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_READ)
@Controller('api/v1/continuous-assurance')
export class ContinuousAssuranceController {
  constructor(private readonly assurance: ContinuousAssuranceService) {}

  private boundary(headerTenantId: string, user: AuthenticatedUser) {
    return {
      tenantId: requireTenantId(headerTenantId),
      environmentId: requireEnvironmentId(user.environmentId),
    };
  }

  @Get('profiles')
  async list(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.assurance.listProfiles(
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Get('profiles/:id')
  async get(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.assurance.getProfile(
        id,
        boundary.tenantId,
        boundary.environmentId,
      ),
    };
  }

  @Post('profiles')
  @RequirePermissions(PERMISSION_CODES.TENANT_COMMERCIAL_ACCOUNT_MANAGE)
  @RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
  async create(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContinuousAssuranceProfileDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.CREATED,
      data: await this.assurance.createProfile(
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
  async decide(
    @Param('id') id: string,
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecideContinuousAssuranceProfileDto,
  ) {
    const boundary = this.boundary(headerTenantId, user);
    return {
      statusCode: HttpStatus.OK,
      data: await this.assurance.decideProfile(
        id,
        boundary.tenantId,
        boundary.environmentId,
        user.id,
        dto,
      ),
    };
  }
}
