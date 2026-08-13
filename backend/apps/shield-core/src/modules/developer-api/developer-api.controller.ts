import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiClientService } from './clients/api-client.service';
import { ApiClientCredentialService } from './credentials/api-client-credential.service';
import { ApiScopeGrantService } from './scopes/api-scope-grant.service';
import { OauthTokenService, AuthContext } from './oauth/oauth-token.service';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';
import { ApiClientAuthGuard } from './guards/api-client-auth.guard';
import { ApiScopeGuard } from './guards/api-scope.guard';
import { ApiRateLimitGuard } from './rate-limit/api-rate-limit.guard';
import { RequireScopes } from './guards/require-scopes.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { requireTenantId } from '../../tenant-context';

/** Admin/tenant-side client management — separate from the public /oauth/token surface, which is G2-gated. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/api-clients')
export class DeveloperApiController {
  constructor(
    private readonly apiClientService: ApiClientService,
    private readonly credentialService: ApiClientCredentialService,
    private readonly scopeGrantService: ApiScopeGrantService,
  ) {}

  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { name: string; purpose: string; environmentScope?: string; expiresAt?: string },
  ) {
    return this.apiClientService.create({
      tenantId: requireTenantId(tenantId),
      createdBy: user.id,
      name: body.name,
      purpose: body.purpose,
      environmentScope: body.environmentScope,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
  }

  @Post(':id/suspend')
  async suspend(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.apiClientService.suspend(requireTenantId(tenantId), id);
  }

  @Post(':id/revoke')
  async revoke(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.apiClientService.revoke(requireTenantId(tenantId), id);
  }

  @Post(':id/rotate-credential')
  async rotateCredential(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) {
    return this.credentialService.rotate(requireTenantId(tenantId), id);
  }

  @Post(':id/scopes')
  async grantScope(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { scope: string; environmentId?: string; expiresAt?: string },
  ) {
    return this.scopeGrantService.grant({ tenantId: requireTenantId(tenantId), apiClientId: id, scope: body.scope, environmentId: body.environmentId, grantedBy: user.id, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined });
  }
}

/** Public OAuth token endpoint — G2-gated (spec §25/§31). */
@Controller('oauth')
@UseGuards(PublicApiEnabledGuard)
export class OauthController {
  constructor(private readonly oauthTokenService: OauthTokenService) {}

  @Post('token')
  async token(@Body() body: { grant_type: string; client_id: string; client_secret: string; scope?: string }) {
    return this.oauthTokenService.issueToken({ grantType: body.grant_type, clientId: body.client_id, clientSecret: body.client_secret, scope: body.scope });
  }
}

/**
 * Demonstrates the full public API guard chain (spec §26/§35):
 * PublicApiEnabledGuard -> ApiClientAuthGuard -> ApiScopeGuard -> ApiRateLimitGuard.
 * Tenant context comes from the authenticated client's token, never from a
 * request body/header/path value (spec §8/correction #8) — this route
 * takes no tenant parameter at all, it reads request.authContext.
 */
@Controller('api/v1/public/alerts')
@UseGuards(PublicApiEnabledGuard, ApiClientAuthGuard, ApiScopeGuard, ApiRateLimitGuard)
export class PublicAlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequireScopes('alerts:read')
  async list(@Req() request: { authContext: AuthContext }) {
    const { tenantId } = request.authContext;
    return this.prisma.alert.findMany({ where: { tenant_id: tenantId }, take: 50, orderBy: { created_at: 'desc' } });
  }
}
