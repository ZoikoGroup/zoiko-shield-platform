import { Body, Controller, ForbiddenException, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard)
@Controller('tenant')
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

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const granted = await this.authorizationService.getPermissionCodesForPrincipal(id, user.id);
    if (!granted.includes(PERMISSION_CODES.TENANT_MANAGE)) {
      throw new ForbiddenException('Missing tenant:manage permission for this tenant');
    }
    return this.tenantService.transitionStatus(id, dto.status, user.id);
  }
}
