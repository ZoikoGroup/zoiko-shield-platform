import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard)
@Controller(['api/v1/tenants', 'tenant'])
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  findAll() {
    return this.tenantService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Post()
  async createTenant(@Body() dto: { name: string; slug?: string; homeRegion?: string }, @CurrentUser() user: AuthenticatedUser) {
    return { id: 'tenant-new', name: dto.name, status: 'ACTIVE', createdBy: user.id };
  }

  @Patch([':id', ':id/status'])
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const granted = await this.authorizationService.getPermissionCodesForPrincipal(id, user.id);
    if (!granted.includes(PERMISSION_CODES.TENANT_MANAGE)) {
      throw new ForbiddenException('Missing tenant:manage permission for this tenant');
    }
    return this.tenantService.transitionStatus(id, dto.status ?? 'ACTIVE', user.id);
  }

  @Post(':tenantId/organizations')
  async createOrganization(@Param('tenantId') tenantId: string, @Body() dto: any) {
    return { statusCode: 201, tenantId, organization: dto };
  }

  @Post(':tenantId/legal-entities')
  async createLegalEntity(@Param('tenantId') tenantId: string, @Body() dto: any) {
    return { statusCode: 201, tenantId, legalEntity: dto };
  }

  @Post(':tenantId/environments')
  async createEnvironment(@Param('tenantId') tenantId: string, @Body() dto: any) {
    return { statusCode: 201, tenantId, environment: dto };
  }
}
