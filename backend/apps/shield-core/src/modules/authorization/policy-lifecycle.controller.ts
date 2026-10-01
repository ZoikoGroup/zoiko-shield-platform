import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { PolicyLifecycleService } from './policy-lifecycle.service';
import type { PolicyDomain } from './dto/policy-lifecycle.dto';
import {
  StagePolicyDto,
  ApprovePolicyDto,
  RollbackPolicyDto,
} from './dto/policy-lifecycle.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { PERMISSION_CODES } from './constants';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/policies')
export class PolicyLifecycleController {
  constructor(
    private readonly policyLifecycleService: PolicyLifecycleService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSION_CODES.POLICY_CONFIG_READ)
  listPolicies(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Query('domain') domain?: string,
  ) {
    const tenantId = headerTenantId || user.tenantId || 'global';
    return this.policyLifecycleService.listPolicies(
      tenantId,
      domain as PolicyDomain,
    );
  }

  @Get(':policyId')
  @RequirePermissions(PERMISSION_CODES.POLICY_CONFIG_READ)
  getPolicyById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = headerTenantId || user.tenantId || 'global';
    return this.policyLifecycleService.getPolicyById(tenantId, policyId);
  }

  @Post(':policyId/stage')
  @RequirePermissions(PERMISSION_CODES.POLICY_CONFIG_WRITE)
  stagePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Body() dto: StagePolicyDto,
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = headerTenantId || user.tenantId || 'global';
    const operator = user.email || user.id || 'secops-admin';
    return this.policyLifecycleService.stagePolicy(
      tenantId,
      policyId,
      dto,
      operator,
    );
  }

  @Post(':policyId/approve')
  @RequirePermissions(PERMISSION_CODES.POLICY_CONFIG_APPROVE)
  approvePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Body() dto: ApprovePolicyDto,
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = headerTenantId || user.tenantId || 'global';
    const approver = user.email || user.id || 'security-approver';
    return this.policyLifecycleService.approvePolicy(
      tenantId,
      policyId,
      approver,
    );
  }

  @Post(':policyId/rollback')
  @RequirePermissions(PERMISSION_CODES.POLICY_CONFIG_ROLLBACK)
  rollbackPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Body() dto: RollbackPolicyDto,
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = headerTenantId || user.tenantId || 'global';
    const operator = user.email || user.id || 'secops-operator';
    return this.policyLifecycleService.rollbackPolicy(
      tenantId,
      policyId,
      dto,
      operator,
    );
  }
}
