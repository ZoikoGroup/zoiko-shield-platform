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

@UseGuards(JwtAuthGuard)
@Controller()
export class AuthorizationController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  // ── Self-service: any authenticated user can inspect their own access ──

  /** Returns all tenant memberships for the caller, with roles and permissions. */
  @Get('me/roles')
  getMyRoles(@CurrentUser() user: AuthenticatedUser) {
    return this.authorizationService.getMembershipsForPrincipal(user.id);
  }

  /** Returns effective permission codes for the caller within a specific tenant. */
  @Get('me/permissions')
  getMyPermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tenantId') tenantId: string,
  ) {
    return this.authorizationService.getPermissionCodesForPrincipal(tenantId, user.id);
  }

  @UseGuards(PlatformPermissionsGuard)
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_PERMISSION_MANAGE)
  @Post('permissions')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.authorizationService.createPermission(dto.code, dto.description);
  }

  @Get('roles')
  findRoles(@Query('tenantId') tenantId?: string) {
    return this.authorizationService.findRoles(tenantId);
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
  @Patch('roles/:roleId/permissions')
  updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.authorizationService.updateRolePermissions(roleId, dto.permissionCodes);
  }

  // Tenant-admin action: create a single-use, tenant-bound, expiring
  // invitation. The invitee never chooses their own tenant or role — both
  // are fixed at invite time. Replaces the old self-assign membership route.
  @Post('tenants/:tenantId/invitations')
  async createInvitation(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const granted = await this.authorizationService.getPermissionCodesForPrincipal(tenantId, user.id);
    if (!granted.includes(PERMISSION_CODES.TENANT_MEMBER_INVITE)) {
      throw new ForbiddenException('Missing tenant:member:invite permission for this tenant');
    }
    const { invitation, token } = await this.authorizationService.createInvitation({
      tenantId,
      invitedEmail: dto.invitedEmail,
      roleId: dto.roleId,
      invitedById: user.id,
    });
    // No transactional-email transport wired into this module yet — the
    // caller (a tenant admin, already authenticated) receives the token
    // directly today; move this to email delivery once available.
    return { invitationId: invitation.id, expiresAt: invitation.expiresAt, token };
  }

  @Post('auth/invitations/:token/accept')
  acceptInvitation(@Param('token') token: string, @CurrentUser() user: AuthenticatedUser) {
    return this.authorizationService.acceptInvitation(token, user.id, user.email);
  }
}
