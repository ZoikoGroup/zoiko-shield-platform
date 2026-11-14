import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OriginCsrfGuard } from '../common/origin-csrf.guard';
import { PublicEndpoint } from '../common/public-endpoint.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { AssistantConfigService } from '../config/assistant-config.service';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  SessionService,
} from './session.service';

@Controller('api/public/chat/v1/sessions')
@PublicEndpoint()
@UseGuards(OriginCsrfGuard, RateLimitGuard)
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: AssistantConfigService,
  ) {}

  @Post()
  create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { session, token } = this.sessions.create(
      request.ip ?? '',
      request.header('user-agent') ?? '',
    );
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/public/chat',
      maxAge: SESSION_TTL_MS,
    });
    return {
      session_id: session.id,
      expires_at: new Date(session.expiresAt).toISOString(),
      epoch: session.epoch,
      limits: this.config.limits(),
    };
  }

  @Post('clear')
  clear(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cleared = this.sessions.clear(request.cookies?.[SESSION_COOKIE]);
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/public/chat',
    });
    return { cleared };
  }
}
