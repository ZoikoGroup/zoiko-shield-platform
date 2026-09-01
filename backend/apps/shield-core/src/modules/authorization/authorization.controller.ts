import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { RequirePlatformPermissions } from './decorators/require-platform-permissions.decorator';
import { PlatformPermissionsGuard } from './guards/platform-permissions.guard';
import { PERMISSION_CODES } from './constants';
import { PermissionsGuard } from './guards/permissions.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { AuthenticationOnlyEndpoint } from '../../security/endpoint-access.decorator';

import { Delete } from '@nestjs/common';

import { JitElevationService } from './jit-elevation.service';

@UseGuards(JwtAuthGuard)
@Controller(['api/v1', ''])
export class AuthorizationController {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly jitElevationService: JitElevationService,
  ) {}

  /** Returns all tenant memberships for the caller, with roles and permissions. */
  @UseGuards(PermissionsGuard)
  @Get('me/roles')
  getMyRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.authorizationService.getMembershipForPrincipal(
      user.tenantId,
      user.id,
    );
  }

  /** Returns effective permission codes for the caller within a specific tenant. */
  @UseGuards(PermissionsGuard)
  @Get('me/permissions')
  getMyPermissions(@CurrentUser() user: AuthenticatedUser) {
    return this.authorizationService.getPermissionCodesForPrincipal(
      user.tenantId,
      user.id,
    );
  }

  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_PERMISSION_MANAGE)
  @Post('permissions')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.authorizationService.createPermission(
      dto.code,
      dto.description,
    );
  }

  @Get('roles')
  @UseGuards(PermissionsGuard)
  findRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.authorizationService.findRoles(user.tenantId);
  }

  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROLE_MANAGE)
  @Post('roles')
  createRole(@Body() dto: CreateRoleDto) {
    return this.authorizationService.createRole({
      tenantId: dto.tenantId ?? null,
      code: dto.code,
      name: dto.name,
      roleLevel: dto.roleLevel,
      permissionCodes: dto.permissionCodes,
    });
  }

  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROLE_MANAGE)
  @Patch(['roles/:roleId', 'roles/:roleId/permissions'])
  updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.authorizationService.updateRolePermissions(
      roleId,
      dto.permissionCodes,
    );
  }

  @UseGuards(PermissionsGuard)
  @Post('tenants/:tenantId/invitations')
  async createInvitation(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const granted =
      await this.authorizationService.getPermissionCodesForPrincipal(
        tenantId,
        user.id,
      );
    if (!granted.includes(PERMISSION_CODES.TENANT_MEMBER_INVITE)) {
      throw new ForbiddenException(
        'Missing tenant:member:invite permission for this tenant',
      );
    }
    const { invitation, token } =
      await this.authorizationService.createInvitation({
        tenantId,
        invitedEmail: dto.invitedEmail,
        roleId: dto.roleId,
        invitedById: user.id,
      });
    return {
      invitationId: invitation.id,
      expiresAt: invitation.expiresAt,
      token,
    };
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSION_CODES.TENANT_MEMBER_INVITE)
  @Get('tenants/:tenantId/invitations')
  async listInvitations(@Param('tenantId') tenantId: string) {
    return this.authorizationService.listInvitations(tenantId);
  }

  @AuthenticationOnlyEndpoint()
  @Post(['invitations/:token/accept', 'auth/invitations/:token/accept'])
  acceptInvitation(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authorizationService.acceptInvitation(
      token,
      user.id,
      user.email,
    );
  }

  @UseGuards(PermissionsGuard)
  @Get('tenants/:tenantId/members')
  async listMembers(@Param('tenantId') tenantId: string) {
    return this.authorizationService.listMembers(tenantId);
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSION_CODES.TENANT_MANAGE)
  @Patch('tenants/:tenantId/members/:memberId')
  async updateMember(
    @Param('tenantId') tenantId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { roleIds?: string[]; status?: 'ACTIVE' | 'SUSPENDED' },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authorizationService.updateMember(tenantId, memberId, {
      ...dto,
      actorId: user.id,
    });
  }

  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSION_CODES.TENANT_MANAGE)
  @Delete('tenants/:tenantId/members/:memberId')
  async removeMember(
    @Param('tenantId') tenantId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authorizationService.removeMember(tenantId, memberId, user.id);
  }

  // -------------------------------------------------------------------------
  // JIT (Just-In-Time) Elevation Endpoints
  // -------------------------------------------------------------------------

  /** Super Admin requests JIT elevation to a target tenant with stated purpose. */
  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROLE_MANAGE)
  @Post('authz/jit/request')
  async requestJitElevation(
    @Body()
    dto: {
      targetTenantId: string;
      statedPurpose: string;
      requestedDurationMinutes?: number;
      roleCode?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jitElevationService.requestElevation({
      superAdminPrincipalId: user.id,
      targetTenantId: dto.targetTenantId,
      statedPurpose: dto.statedPurpose,
      requestedDurationMinutes: dto.requestedDurationMinutes,
      roleCode: dto.roleCode,
    });
  }

  /** Independent peer admin approves JIT elevation. */
  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROLE_MANAGE)
  @Post('authz/jit/:requestId/approve')
  async approveJitElevation(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jitElevationService.approveElevation({
      requestId,
      approverPrincipalId: user.id,
    });
  }

  /** Peer admin rejects JIT elevation. */
  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROLE_MANAGE)
  @Post('authz/jit/:requestId/reject')
  async rejectJitElevation(
    @Param('requestId') requestId: string,
    @Body() dto: { rejectionReason: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jitElevationService.rejectElevation({
      requestId,
      approverPrincipalId: user.id,
      rejectionReason: dto.rejectionReason,
    });
  }

  /** Revokes active JIT elevation before expiration. */
  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_ROLE_MANAGE)
  @Post('authz/jit/:requestId/revoke')
  async revokeJitElevation(
    @Param('requestId') requestId: string,
    @Body() dto: { revocationReason: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jitElevationService.revokeElevation({
      requestId,
      revokerPrincipalId: user.id,
      revocationReason: dto.revocationReason,
    });
  }

  /** Customer-visible audit trail of all JIT elevation events for that tenant. */
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSION_CODES.TENANT_RESOURCE_READ)
  @Get('tenants/:tenantId/jit-audit')
  async getTenantJitAudit(@Param('tenantId') tenantId: string) {
    return this.jitElevationService.getCustomerAuditTrail(tenantId);
  }
}
