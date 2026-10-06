import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PlatformPermissionsGuard } from '../../authorization/guards/platform-permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { ScimService } from './scim.service';
import { CreateScimUserDto } from './dto/scim-user.dto';
import { CreateScimGroupDto } from './dto/scim-group.dto';
import { ScimPatchDto } from './dto/scim-patch.dto';

@Controller('api/v1/scim/v2')
export class ScimController {
  constructor(private readonly scimService: ScimService) {}

  @Get('ServiceProviderConfig')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  getServiceProviderConfig() {
    return this.scimService.getServiceProviderConfig();
  }

  @Get('ResourceTypes')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  getResourceTypes() {
    return this.scimService.getResourceTypes();
  }

  @Get('Users')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  @RequirePermissions('identity:users:read')
  listUsers(
    @Headers('x-tenant-id') tenantId: string = 'tenant-default',
    @Query('startIndex') startIndex = '1',
    @Query('count') count = '100',
  ) {
    return this.scimService.listUsers(
      tenantId,
      parseInt(startIndex, 10) || 1,
      parseInt(count, 10) || 100,
    );
  }

  @Get('Users/:id')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  @RequirePermissions('identity:users:read')
  getUser(
    @Headers('x-tenant-id') tenantId: string = 'tenant-default',
    @Param('id') id: string,
  ) {
    return this.scimService.getUser(tenantId, id);
  }

  @Post('Users')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  @RequirePermissions('identity:users:write')
  @HttpCode(HttpStatus.CREATED)
  createUser(
    @Headers('x-tenant-id') tenantId: string = 'tenant-default',
    @Body() dto: CreateScimUserDto,
  ) {
    return this.scimService.createUser(tenantId, dto);
  }

  @Patch('Users/:id')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  @RequirePermissions('identity:users:write')
  patchUser(
    @Headers('x-tenant-id') tenantId: string = 'tenant-default',
    @Param('id') id: string,
    @Body() patch: ScimPatchDto,
  ) {
    return this.scimService.patchUser(tenantId, id, patch);
  }

  @Delete('Users/:id')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  @RequirePermissions('identity:users:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Headers('x-tenant-id') tenantId: string = 'tenant-default',
    @Param('id') id: string,
  ) {
    await this.scimService.deleteUser(tenantId, id);
  }

  @Get('Groups')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  @RequirePermissions('identity:groups:read')
  listGroups(
    @Headers('x-tenant-id') tenantId: string = 'tenant-default',
    @Query('startIndex') startIndex = '1',
    @Query('count') count = '100',
  ) {
    return this.scimService.listGroups(
      tenantId,
      parseInt(startIndex, 10) || 1,
      parseInt(count, 10) || 100,
    );
  }

  @Post('Groups')
  @UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
  @RequirePermissions('identity:groups:write')
  @HttpCode(HttpStatus.CREATED)
  createGroup(
    @Headers('x-tenant-id') tenantId: string = 'tenant-default',
    @Body() dto: CreateScimGroupDto,
  ) {
    return this.scimService.createGroup(tenantId, dto);
  }
}
