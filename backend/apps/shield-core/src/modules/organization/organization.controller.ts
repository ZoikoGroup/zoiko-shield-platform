import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenant/:tenantId/organizations')
export class OrganizationController {
  constructor(
    private readonly service: OrganizationService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async requireManage(tenantId: string, user: AuthenticatedUser): Promise<void> {
    const granted = await this.authorizationService.getPermissionCodesForPrincipal(tenantId, user.id);
    if (!granted.includes(PERMISSION_CODES.TENANT_MANAGE)) {
      throw new ForbiddenException('Missing tenant:manage permission for this tenant');
    }
  }

  @Post()
  async create(
    @Param('tenantId') tenantId: string,
    @Body() createDto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.requireManage(tenantId, user);
    return this.service.create(tenantId, createDto);
  }

  @Get()
  async findAll(@Param('tenantId') tenantId: string) {
    const items = await this.service.findAllForTenant(tenantId);
    return { data: items, total: items.length };
  }

  @Get(':id')
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Patch(':id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.requireManage(tenantId, user);
    return this.service.update(tenantId, id, updateDto);
  }

  @Delete(':id')
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.requireManage(tenantId, user);
    await this.service.remove(tenantId, id);
    return { success: true };
  }
}
