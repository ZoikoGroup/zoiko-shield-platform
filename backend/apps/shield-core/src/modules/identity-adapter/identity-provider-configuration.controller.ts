import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PERMISSION_CODES } from '../authorization/constants';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { CreateIdentityProviderDto } from './dto/create-identity-provider.dto';
import { UpdateIdentityProviderDto } from './dto/update-identity-provider.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { IdentityProviderConfigurationService } from './identity-provider-configuration.service';
import type { AuthenticatedUser } from './interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSION_CODES.TENANT_IDENTITY_PROVIDER_MANAGE)
@Controller([
  'api/v1/tenants/:tenantId/identity-providers',
  'tenants/:tenantId/identity-providers',
])
export class IdentityProviderConfigurationController {
  constructor(
    private readonly providers: IdentityProviderConfigurationService,
  ) {}

  @Get()
  list(@Param('tenantId') tenantId: string) {
    return this.providers.listForTenant(tenantId);
  }

  @Post()
  create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateIdentityProviderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.providers.create(tenantId, dto, user.id);
  }

  @Patch(':providerId')
  update(
    @Param('tenantId') tenantId: string,
    @Param('providerId') providerId: string,
    @Body() dto: UpdateIdentityProviderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.providers.update(tenantId, providerId, dto, user.id);
  }

  @Post(':providerId/activate')
  activate(
    @Param('tenantId') tenantId: string,
    @Param('providerId') providerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.providers.activate(tenantId, providerId, user.id);
  }

  @Get(':providerId/saml-metadata')
  async samlMetadata(
    @Param('tenantId') tenantId: string,
    @Param('providerId') providerId: string,
    @Res() res: Response,
  ) {
    const metadata = await this.providers.samlMetadataForTenant(
      tenantId,
      providerId,
    );
    return res.type('application/samlmetadata+xml').send(metadata);
  }

  @Post(':providerId/disable')
  disable(
    @Param('tenantId') tenantId: string,
    @Param('providerId') providerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.providers.disable(tenantId, providerId, user.id);
  }
}
