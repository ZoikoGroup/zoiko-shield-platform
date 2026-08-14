import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { StartSsoDto } from './dto/start-sso.dto';
import { FederationAuthService } from './federation-auth.service';
import { IdentityProviderConfigurationService } from './identity-provider-configuration.service';
import { setAuthCookies } from './auth-cookies';
import { PublicEndpoint } from '../../security/endpoint-access.decorator';

function requestMetadata(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@PublicEndpoint()
@Controller(['api/v1/auth/sso', 'auth/sso'])
export class FederationController {
  constructor(
    private readonly federation: FederationAuthService,
    private readonly providers: IdentityProviderConfigurationService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('discovery/:tenantSlug')
  discover(@Param('tenantSlug') tenantSlug: string) {
    return this.providers.discoverForTenantSlug(tenantSlug);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('start')
  start(@Body() dto: StartSsoDto, @Req() req: Request) {
    return this.federation.start(dto, requestMetadata(req));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oidc/callback')
  async oidcCallback(
    @Query('state') state: string,
    @Query('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.federation.completeOidc(
      { state, code },
      requestMetadata(req),
    );
    setAuthCookies(res, result.tokens);
    return res.redirect(303, result.redirectUrl);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('saml/callback')
  async samlCallback(
    @Body('RelayState') relayState: string,
    @Body('SAMLResponse') samlResponse: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.federation.completeSaml(
      { relayState, samlResponse },
      requestMetadata(req),
    );
    setAuthCookies(res, result.tokens);
    return res.redirect(303, result.redirectUrl);
  }

  @Get('saml/metadata/:tenantSlug/:providerId')
  async samlMetadata(
    @Param('tenantSlug') tenantSlug: string,
    @Param('providerId') providerId: string,
    @Res() res: Response,
  ) {
    const metadata = await this.providers.samlMetadata(tenantSlug, providerId);
    res.type('application/samlmetadata+xml').send(metadata);
  }
}
