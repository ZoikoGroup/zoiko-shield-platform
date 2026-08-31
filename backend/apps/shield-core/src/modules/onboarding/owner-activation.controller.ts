import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PublicEndpoint } from '../../security/endpoint-access.decorator';
import type { SessionMetadata } from '../identity-adapter/session.service';
import { StartOwnerActivationDto } from './dto/start-owner-activation.dto';
import { OwnerActivationService } from './owner-activation.service';

function sessionMetadataFrom(req: Request): SessionMetadata {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@Controller([
  'api/v1/auth/owner-invitations',
  'auth/owner-invitations',
])
export class OwnerActivationController {
  constructor(
    private readonly ownerActivationService: OwnerActivationService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @PublicEndpoint()
  @Get(':token')
  inspect(@Param('token') token: string) {
    return this.ownerActivationService.inspect(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @PublicEndpoint()
  @Post(':token/start')
  start(
    @Param('token') token: string,
    @Body() dto: StartOwnerActivationDto,
    @Req() req: Request,
  ) {
    return this.ownerActivationService.start(
      token,
      dto,
      sessionMetadataFrom(req),
    );
  }
}
