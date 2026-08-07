import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard)
@Controller()
export class AuthorizationController {
  constructor(private readonly authorizationService: AuthorizationService) {}

  @Post('permissions')
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.authorizationService.createPermission(dto.code, dto.description);
  }

  @Get('roles')
  findRoles(@Query('tenantId') tenantId?: string) {
    return this.authorizationService.findRoles(tenantId);
  }

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

  @Patch('roles/:roleId/permissions')
  updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.authorizationService.updateRolePermissions(roleId, dto.permissionCodes);
  }

  // Bootstrap endpoint: lets the current user join a tenant with a given role.
  // Stands in for the invitation flow until tenant onboarding/invitations are built.
  @Post('tenants/:tenantId/memberships/self')
  joinTenant(
    @Param('tenantId') tenantId: string,
    @Body('roleId') roleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authorizationService.assignRole(tenantId, user.id, roleId);
  }
}
